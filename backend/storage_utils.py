import os
import uuid
import base64
from datetime import datetime, timedelta
from typing import Tuple, Optional
from urllib.parse import urlparse, urlunparse, unquote

from azure.storage.blob import BlobServiceClient, ContentSettings, PublicAccess
from azure.storage.blob import generate_blob_sas, BlobSasPermissions
from PIL import Image
from io import BytesIO


def _get_blob_service_client() -> BlobServiceClient:
    connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    if not connection_string:
        raise RuntimeError("AZURE_STORAGE_CONNECTION_STRING is not set")
    return BlobServiceClient.from_connection_string(connection_string)


def _get_container_name() -> str:
    return os.getenv("AZURE_STORAGE_CONTAINER", "images")


def ensure_container_public() -> None:
    """Ensure the container exists. Public access is optional and may be disabled by policy."""
    service = _get_blob_service_client()
    name = _get_container_name()
    container = service.get_container_client(name)
    try:
        container.create_container(public_access=PublicAccess.Blob)
    except Exception:
        # Already exists or cannot create; ignore
        pass
    # Try to set access policy in case the container existed without public access
    try:
        container.set_container_access_policy(public_access=PublicAccess.Blob)
    except Exception:
        # Some emulators or policies may block this; ignore
        pass


def parse_data_url(data_url: str) -> Tuple[Optional[str], Optional[bytes]]:
    try:
        if data_url and data_url.startswith("data:") and ";base64," in data_url:
            header, b64 = data_url.split(",", 1)
            mime = header.split(":", 1)[1].split(";", 1)[0]
            return mime, base64.b64decode(b64)
    except Exception:
        return None, None
    return None, None


def _gen_blob_name(prefix: str, ext: str) -> str:
    ts = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    uid = uuid.uuid4().hex
    clean_ext = (ext or ".bin").lstrip(".")
    return f"{prefix}/{ts}-{uid}.{clean_ext}"


def upload_bytes(data: bytes, content_type: str, prefix: str, extension: Optional[str] = None) -> str:
    service = _get_blob_service_client()
    container = service.get_container_client(_get_container_name())
    try:
        container.create_container(public_access=PublicAccess.Blob)
    except Exception:
        pass
    ext = extension or _guess_ext_from_mime(content_type)
    blob_name = _gen_blob_name(prefix, ext)
    blob_client = container.get_blob_client(blob_name)
    blob_client.upload_blob(
        data,
        overwrite=True,
        content_settings=ContentSettings(content_type=content_type)
    )
    return blob_client.url


def _guess_ext_from_mime(mime: str) -> str:
    if not mime:
        return "bin"
    if "/" in mime:
        return mime.split("/", 1)[1]
    return "bin"


def generate_thumbnail(image_bytes: bytes, max_width: int = 300, output_format: str = "JPEG", quality: int = 85) -> Tuple[bytes, str]:
    image = Image.open(BytesIO(image_bytes))
    # Convert to RGB to ensure JPEG compatibility
    if image.mode in ("RGBA", "P"):
        image = image.convert("RGB")
    w, h = image.size
    if w > max_width:
        new_h = int(h * (max_width / float(w)))
        image = image.resize((max_width, max(1, new_h)), Image.LANCZOS)
    buf = BytesIO()
    fmt = output_format.upper()
    mime = f"image/{'jpeg' if fmt == 'JPEG' else fmt.lower()}"
    save_kwargs = {"quality": quality}
    if fmt != "JPEG":
        save_kwargs.pop("quality", None)
    image.save(buf, format=fmt, **save_kwargs)
    return buf.getvalue(), mime


def upload_image_and_thumbnail(image_bytes: bytes, mime_type: str, prefix: str = "images", thumb_width: int = 300) -> Tuple[str, str]:
    """Upload original and thumbnail; return (original_url, thumb_url)."""
    original_ext = _guess_ext_from_mime(mime_type)
    original_url = upload_bytes(image_bytes, mime_type, prefix=prefix, extension=original_ext)
    thumb_bytes, thumb_mime = generate_thumbnail(image_bytes, max_width=thumb_width)
    thumb_url = upload_bytes(thumb_bytes, thumb_mime, prefix=f"{prefix}/thumbs", extension=_guess_ext_from_mime(thumb_mime))
    return original_url, thumb_url


def _parse_conn_string() -> dict:
    cs = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
    parts = [p for p in cs.split(";") if p]
    out = {}
    for p in parts:
        if "=" in p:
            k, v = p.split("=", 1)
            out[k] = v
    return out


def _extract_container_blob_from_url(url: str) -> Tuple[Optional[str], Optional[str]]:
    """Extract container and blob from a blob URL, ignoring any query string.

    Handles both Azurite (account in path) and Azure (account in host). Ensures the blob
    name does NOT include the query parameters (e.g., SAS), and decodes percent-escapes.
    """
    try:
        parsed = urlparse(url)
        # Drop query entirely; work only with path
        path = parsed.path.lstrip('/')
        # If azurite includes account in the first segment, drop it
        segs = path.split('/') if path else []
        account_name = _get_account_name()
        if segs and account_name and segs[0] == account_name:
            segs = segs[1:]
        if not segs or len(segs) < 2:
            return None, None
        container = segs[0]
        blob = '/'.join(segs[1:])
        # Ensure we don't carry query fragments and decode percent-escapes
        blob = unquote(blob)
        return container, blob
    except Exception:
        return None, None


def _get_account_name() -> Optional[str]:
    return _parse_conn_string().get("AccountName")


def _get_account_key() -> Optional[str]:
    return _parse_conn_string().get("AccountKey")


def sign_blob_url(url: str, hours: int = 48) -> str:
    """Return a read-only SAS URL for the given blob URL. Falls back to raw URL if missing key.
    - Strips any existing query (old SAS) before appending the new one
    - Adds a small negative skew to start time to avoid clock drift issues
    """
    try:
        account_name = _get_account_name()
        account_key = _get_account_key()
        if not account_name or not account_key:
            return make_public_url(url)
        container, blob = _extract_container_blob_from_url(url)
        if not container or not blob:
            return make_public_url(url)
        # Use a start time slightly in the past to tolerate clock skew
        start_time = datetime.utcnow() - timedelta(minutes=5)
        expiry_time = start_time + timedelta(hours=hours)
        sas = generate_blob_sas(
            account_name=account_name,
            container_name=container,
            blob_name=blob,
            account_key=account_key,
            permission=BlobSasPermissions(read=True),
            start=start_time,
            expiry=expiry_time
        )
        # Build base URL suitable for browser, with query/fragment removed
        base_with_host = make_public_url(url)
        parsed = urlparse(base_with_host)
        base_no_query = urlunparse(parsed._replace(query='', fragment=''))
        return f"{base_no_query}?{sas}"
    except Exception:
        return make_public_url(url)


def make_public_url(url: str) -> str:
    """Rewrite internal service host to a browser-accessible base if configured.
    - If PUBLIC_BLOB_BASE_URL is set, replace scheme+host (and optional account path) with it.
    - Else, if host is 'azurite', replace with 'localhost:10000'.
    """
    try:
        override = os.getenv("PUBLIC_BLOB_BASE_URL", "").rstrip('/')
        parsed = urlparse(url)
        if override:
            # If override includes '/devstoreaccount1', keep suffix after that marker
            marker = '/devstoreaccount1/'
            if marker in url:
                suffix = url.split(marker, 1)[1]
                return f"{override}{'/' if not override.endswith('/') else ''}{suffix}"
            # Azure style: https://<acct>.blob.core.windows.net/<container>/<blob>
            # Keep path as-is
            return f"{override}{parsed.path}"
        # No override: fix azurite host for browser
        if parsed.hostname == 'azurite':
            pub = parsed._replace(scheme='http', netloc='localhost:10000')
            return urlunparse(pub)
        return url
    except Exception:
        return url


def download_blob_bytes_from_url(url: str) -> Tuple[Optional[bytes], Optional[str]]:
    """If the URL points to our storage account/container, download bytes using SDK.
    Returns (bytes, content_type) or (None, None) if not possible.
    """
    try:
        container, blob = _extract_container_blob_from_url(url)
        if not container or not blob:
            return None, None
        service = _get_blob_service_client()
        bc = service.get_blob_client(container, blob)
        props = bc.get_blob_properties()
        data = bc.download_blob(max_concurrency=1).readall()
        ctype = None
        try:
            ctype = getattr(props, "content_settings", None).content_type  # type: ignore[attr-defined]
        except Exception:
            ctype = None
        return data, ctype or "image/png"
    except Exception:
        return None, None


