from flask import Flask, request, jsonify, g
from flask_cors import CORS
import os
from datetime import date
from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from db import SessionLocal
from models import User, Story, Chapter as DBChapter, Base, AccountDeletion, CreditAddition, CharacterImage
from functools import wraps
from auth_utils import hash_password, verify_password
from jwt_utils import create_access_token, decode_token, create_refresh_token, decode_refresh_token
import base64
import mimetypes
try:
    from google import genai
    from google.genai import types as genai_types
except Exception:
    genai = None
    genai_types = None
from io import BytesIO
from openai import OpenAI
from pydantic import BaseModel
from prompts import PROMPT_USER1, PROMPT_SYSTEM_SEED, PROMPT_SYSTEM_CHAPTER, PROMPT_SYSTEM_CHAPTER_FINAL, PROMPT_CREATE_CHARACTER

client = OpenAI()   

load_dotenv()

class Chapter(BaseModel):
   text: str
   image_prompt: str
   choices: list[str] | None = None
  

app = Flask(__name__)
CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=True,
    allow_headers=["Authorization", "Content-Type"],
    methods=["GET", "POST", "OPTIONS", "DELETE"]
)

@app.route("/test", methods=["GET"])
def get_api_test():
    return "esto es un test de contacto solo"

def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        # Let CORS preflight pass
        if request.method == "OPTIONS":
            return ("", 204)
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "missing bearer token"}), 401
        token = auth.split(" ", 1)[1].strip()
        try:
            payload = decode_token(token)
            g.user_id = int(payload.get("sub"))
        except Exception as e:
            # Puedes distinguir expired/invalid si quieres:
            return jsonify({"error": "invalid_or_expired_token"}), 401
        return f(*args, **kwargs)
    return wrapper

@app.post("/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = data.get("name") or None

    if not email or "@" not in email:
        return jsonify({"error": "email_invalid"}), 400
    if len(password) < 8:
        return jsonify({"error": "password_too_short"}), 400

    pw_hash = hash_password(password)

    with SessionLocal() as session:
        user = User(email=email, password_hash=pw_hash, name=name)
        # Set initial credits from env
        try:
            default_credits = int(os.environ.get("DEFAULT_CREDITS", "10"))
        except Exception:
            default_credits = 10
        user.credits = default_credits
        session.add(user)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            # por el unique en email
            return jsonify({"error": "email_already_exists"}), 409

        # opcional: emitir token tras registro
        access = create_access_token(user.id, extra={"email": user.email})
        refresh = create_refresh_token(user.id)
        return jsonify({
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "credits": user.credits,
            "access_token": access,
            "refresh_token": refresh
        }), 201

@app.post("/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "missing_credentials"}), 400

    with SessionLocal() as session:
        user = session.query(User).filter(User.email == email).first()
        if not user or not verify_password(password, user.password_hash):
            return jsonify({"error": "invalid_credentials"}), 401

        access = create_access_token(user.id, extra={"email": user.email})
        refresh = create_refresh_token(user.id)
        # (opcional) actualizar last_login_at
        from datetime import datetime, timezone
        user.last_login_at = datetime.now(timezone.utc)
        session.commit()

        return jsonify({
            "access_token": access,
            "refresh_token": refresh,
            "user": {"id": user.id, "email": user.email, "name": user.name, "credits": user.credits}
        }), 200

@app.post("/auth/refresh")
def refresh_access():
    data = request.get_json(silent=True) or {}
    incoming = data.get("refresh_token")
    if not incoming:
        return jsonify({"error": "no_refresh_token"}), 401
    try:
        payload = decode_refresh_token(incoming)
        user_id = int(payload.get("sub"))
    except Exception:
        return jsonify({"error": "invalid_refresh"}), 401
    access = create_access_token(user_id)
    # Optional: rotate refresh
    refresh = create_refresh_token(user_id)
    return jsonify({"access_token": access, "refresh_token": refresh})

@app.get("/me")
@require_auth
def me():
    with SessionLocal() as session:
        user = session.get(User, g.user_id)
        if not user:
            return jsonify({"error": "not_found"}), 404
        return jsonify(user.to_dict()), 200

# ---- Characters (images) ----
@app.get("/characters")
@require_auth
def list_characters_images():
    """Return all character images saved by this user in character_images table.

    Shape: { items: { id, image, name }[] } (backwards-compat: also returns images: string[])
    """
    try:
        with SessionLocal() as session:
            rows = (
                session.query(CharacterImage.id, CharacterImage.image_data, CharacterImage.name)
                .filter(CharacterImage.user_id == g.user_id)
                .order_by(CharacterImage.created_at.desc())
                .all()
            )
            items = [
                {"id": r[0], "image": r[1], "name": r[2]}
                for r in rows
            ]
            # keep legacy images array for existing clients
            images_only = [r[1] for r in rows]
            return jsonify({"items": items, "images": images_only}), 200
    except Exception as e:
        return jsonify({"error": "list_characters_failed", "detail": str(e)}), 500

# ---- Billing: Add Credits ----
@app.post("/billing/add-credits")
@require_auth
def add_credits():
    body = request.get_json(silent=True) or {}
    # Accept either explicit credits or plan key
    plan = (body.get("plan") or "").strip().lower()
    credits = body.get("credits")
    plan_map = {
        "starter": 50,
        "pro": 100,
        "max": 150,
    }
    if isinstance(credits, int) and credits > 0:
        add = credits
    elif plan in plan_map:
        add = plan_map[plan]
    else:
        return jsonify({"error": "invalid_request"}), 400

    with SessionLocal() as session:
        user = session.get(User, g.user_id)
        if not user:
            return jsonify({"error": "not_found"}), 404
        user.credits = max(0, (user.credits or 0)) + int(add)
        # Audit trail
        try:
            session.add(CreditAddition(user_id=user.id, added=int(add), total_after=int(user.credits)))
        except Exception as e:
            print(f"Failed to insert CreditAddition: {e}")
        session.commit()
        return jsonify({"ok": True, "credits": user.credits, "user": user.to_dict()})

@app.get("/billing/credit-additions")
@require_auth
def list_credit_additions():
    with SessionLocal() as session:
        rows = (
            session.query(CreditAddition)
            .filter(CreditAddition.user_id == g.user_id)
            .order_by(CreditAddition.created_at.desc())
            .all()
        )
        return jsonify([
            {
                "id": r.id,
                "added": r.added,
                "total_after": r.total_after,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ])

@app.post("/ai/generate-seed")
@require_auth
def ai_generate_seed():  
    body = request.json or {}
    topic = body.get("prompt") or (
        "a brave young fox in a moonlit enchanted forest"
    )
    # New: support character IDs instead of direct images
    character_ids = body.get("character_ids") or []
    if not isinstance(character_ids, list):
        character_ids = []
    # Resolve character names (and optionally images) for prompt context
    character_names: list[str] = []
    try:
        if character_ids:
            with SessionLocal() as session:
                # constrain to this user for safety
                ids: list[int] = []
                for cid in character_ids:
                    try:
                        ids.append(int(cid))
                    except Exception:
                        continue
                if ids:
                    rows = (
                        session.query(CharacterImage.id, CharacterImage.name)
                        .filter(CharacterImage.user_id == g.user_id)
                        .filter(CharacterImage.id.in_(ids))
                        .all()
                    )
                    character_names = [r[1] for r in rows if (r[1] or "").strip()]
    except Exception:
        pass
    
    if topic:
        try:
            # Check credits BEFORE invoking LLM
            user_id = getattr(g, 'user_id', None)
            if not user_id:
                return jsonify({"error": "unauthorized"}), 401
            with SessionLocal() as session:
                u = session.get(User, user_id)
                if not u or (u.credits or 0) <= 0:
                    return jsonify({"error": "insufficient_credits"}), 402

            # If characters were provided, enrich the user prompt with their names
            enriched_topic = topic
            if character_names:
                try:
                    enriched_topic = f"{topic}. Characters: {', '.join(character_names)}."
                except Exception:
                    enriched_topic = topic

            completion = client.responses.parse(
                # model="gpt-4o-2024-08-06",
                model="gpt-5-nano",
                input=[
                    {"role": "system", "content": PROMPT_SYSTEM_SEED},
                    {"role": "user", "content": PROMPT_USER1 + enriched_topic}
                ],
                text_format=Chapter,
            )
            response = completion.output_parsed
            response_dict = response.model_dump()

            # Persist first chapter and decrement credits
            with SessionLocal() as session:
                # Create story
                story = Story(user_id=user_id, title=((topic[:60] or "Untitled")), status="in_progress")
                session.add(story); session.flush()
                # Add chapter 1
                ch = DBChapter(
                    story_id=story.id,
                    index_in_story=1,
                    title=f"{topic[:40]}",
                    text=response_dict.get('text') or '',
                    image_url=None
                )
                session.add(ch)
                # Initialize cover and character references on story
                story.cover_image_url = None
                try:
                    if character_ids:
                        import json
                        # Keep only ints
                        ids = []
                        for cid in character_ids:
                            try:
                                ids.append(int(cid))
                            except Exception:
                                continue
                        if ids:
                            story.character_ids_json = json.dumps(ids)
                except Exception:
                    pass
                # decrement credits
                u = session.get(User, user_id)
                u.credits = max(0, (u.credits or 0) - 1)
                session.commit()
                response_dict.update({"story_id": story.id, "chapter_id": ch.id})

            return jsonify(response_dict)
        except Exception as e:
            print(f"Failed to generate story: {e}")
            return jsonify({"error": "chapter_generation_failed", "detail": str(e)}), 500
    else:
        return jsonify({'error': 'No topic provided'}), 400

@app.post("/ai/generate-chapter")
@require_auth
def ai_generate_chapter():  
    body = request.json or {}
    topic = body.get("prompt") or (
        "a brave young fox in a moonlit enchanted forest"
    )
    history = body.get("history") or []  # list of previous chapter texts
    if not isinstance(history, list):
        history = []
    mode = (body.get("mode") or "continue").lower()
    story_id_from_client = body.get("story_id")
    
    if topic:
        try:
            # Check credits BEFORE invoking LLM
            user_id = getattr(g, 'user_id', None)
            if not user_id:
                return jsonify({"error": "unauthorized"}), 401
            with SessionLocal() as session:
                u = session.get(User, user_id)
                if not u or (u.credits or 0) <= 0:
                    return jsonify({"error": "insufficient_credits"}), 402

            # Build context message with previous chapters
            previous_text = "\n\n".join([f"Chapter {i+1}: {t}" for i, t in enumerate(history) if isinstance(t, str) and t.strip()])
            
            # Choose prompt based on requested mode
            if mode == "final":
                system_prompt = PROMPT_SYSTEM_CHAPTER_FINAL
            else:
                system_prompt = PROMPT_SYSTEM_CHAPTER
            messages = [
                {"role": "system", "content": system_prompt},
            ]
            if previous_text:
                messages.append({"role": "user", "content": f"Previous chapters so far:\n{previous_text}"})
            messages.append({"role": "user", "content": f"Continue the story. Next chapter idea: {topic}"})

            completion = client.responses.parse(
                model="gpt-4.1-nano-2025-04-14",
                #model="gpt-5-nano",
                input=messages,
                text_format=Chapter,
            )
            response = completion.output_parsed
            response_dict = response.model_dump()

            # Persist or update DB
            with SessionLocal() as session:
                story = None
                if story_id_from_client:
                    story = session.get(Story, int(story_id_from_client))
                if story is None:
                    # Fallback to latest story
                    story = (
                        session.query(Story)
                        .filter(Story.user_id == user_id)
                        .order_by(Story.id.desc())
                        .first()
                    )
                if not story:
                    story = Story(user_id=user_id, title=((topic[:60] or "Untitled")), status="in_progress")
                    session.add(story); session.flush()
                # Next chapter index
                next_idx = (session.query(DBChapter)
                             .filter(DBChapter.story_id == story.id)
                             .count()) + 1
                ch = DBChapter(
                    story_id=story.id,
                    index_in_story=next_idx,
                    title=f"{topic[:40]}",
                    text=response_dict.get('text') or '',
                    image_url=None
                )
                session.add(ch)
                # If final mode, mark story as finished
                if mode == "final":
                    story.status = "finished"
                # decrement credits
                u = session.get(User, user_id)
                u.credits = max(0, (u.credits or 0) - 1)
                session.commit()
                response_dict.update({"story_id": story.id, "chapter_id": ch.id})

            return jsonify(response_dict)
        except Exception as e:
            print(f"Failed to generate story: {e}")
            return jsonify({"error": "chapter_generation_failed", "detail": str(e)}), 500
    else:
        return jsonify({'error': 'No topic provided'}), 400



# ---- AI Image Generation Endpoint ----
@app.post("/ai/generate-image")
@require_auth
def ai_generate_image():
    """Generate an image using Google GenAI and return a data URL.

    Body JSON: {"prompt": string}
    If prompt is missing, a default is used.
    """
    body = request.json or {}
    prompt = body.get("prompt") or (
        "a brave young fox in a moonlit enchanted forest, soft lighting, warm colors, friendly mood, storybook style."
    )
    prompt = f"{prompt}. Use the provided reference images of the characters to ensure consistency."
    print(f"prompt: {prompt}")
    story_id_from_client = body.get("story_id")
    chapter_id_from_client = body.get("chapter_id")
    images_from_client = body.get("images") or []
    print(f"images_from_client: {images_from_client}")
    if not isinstance(images_from_client, list):
        images_from_client = []
    # New: allow providing character_ids, or fallback to story.character_ids_json
    character_ids = body.get("character_ids") or []
    if not isinstance(character_ids, list):
        character_ids = []

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "missing_gemini_api_key"}), 400

    if genai is None:
        return jsonify({"error": "google_genai_not_installed"}), 500

    try:
        # If no images were provided by client, try loading stored story character images via IDs first
        if not images_from_client:
            try:
                import json
                with SessionLocal() as session:
                    story = None
                    if chapter_id_from_client:
                        ch = session.get(DBChapter, int(chapter_id_from_client))
                        if ch is not None:
                            story = session.get(Story, ch.story_id)
                    if story is None and story_id_from_client:
                        story = session.get(Story, int(story_id_from_client))
                    if story is None:
                        user_id = getattr(g, 'user_id', None)
                        story = (
                            session.query(Story)
                            .filter(Story.user_id == user_id)
                            .order_by(Story.id.desc())
                            .first()
                        )
                    # First try IDs
                    if story and getattr(story, 'character_ids_json', None):
                        id_list = []
                        try:
                            parsed_ids = json.loads(story.character_ids_json)
                            if isinstance(parsed_ids, list):
                                id_list = [int(x) for x in parsed_ids]
                        except Exception:
                            id_list = []
                        if id_list:
                            rows = (
                                session.query(CharacterImage.image_data)
                                .filter(CharacterImage.user_id == g.user_id)
                                .filter(CharacterImage.id.in_(id_list))
                                .all()
                            )
                            images_from_client = [r[0] for r in rows if isinstance(r[0], str)]
                    # Fallback to legacy images_json
                    if not images_from_client and story and getattr(story, 'character_images_json', None):
                        parsed = json.loads(story.character_images_json)
                        if isinstance(parsed, list):
                            images_from_client = [i for i in parsed if isinstance(i, str)]
            except Exception:
                pass

        client = genai.Client(api_key=api_key)
        model = "gemini-2.5-flash-image-preview"

        # Helper: decode data URL -> (mime, bytes)
        def decode_data_url(data_url: str):
            try:
                if data_url.startswith("data:") and ";base64," in data_url:
                    header, b64 = data_url.split(",", 1)
                    mime = header.split(":", 1)[1].split(";", 1)[0]
                    return mime, base64.b64decode(b64)
            except Exception:
                pass
            return None, None

        # Build user parts: text + optional inline images from client
        user_parts = [genai_types.Part.from_text(text=prompt)]
        for img in images_from_client[:3]:
            if isinstance(img, str):
                mime, blob = decode_data_url(img)
                if blob:
                    try:
                        # Prefer explicit inline data part constructor if available
                        if hasattr(genai_types.Part, "from_inline_data"):
                            user_parts.append(genai_types.Part.from_inline_data(mime_type=mime or "image/png", data=blob))
                        else:
                            user_parts.append(genai_types.Part.from_bytes(data=blob, mime_type=mime or "image/png"))
                    except Exception:
                        continue

        contents = [genai_types.Content(role="user", parts=user_parts)]
        generate_content_config = genai_types.GenerateContentConfig(
            response_modalities=["IMAGE"],
        )

        image_data = None
        image_mime = None
        text_parts = []
        for chunk in client.models.generate_content_stream(
            model=model, contents=contents, config=generate_content_config
        ):
            try:
                cand = chunk.candidates[0]
                if cand and cand.content and cand.content.parts:
                    part0 = cand.content.parts[0]
                    if getattr(part0, "inline_data", None) and getattr(part0.inline_data, "data", None):
                        image_data = part0.inline_data.data
                        image_mime = getattr(part0.inline_data, "mime_type", None) or "image/png"
                    elif getattr(chunk, "text", None):
                        text_parts.append(chunk.text)
            except Exception:
                continue

        if not image_data:
            # If client provided an image, prefer that
            try:
                first_img = None
                if images_from_client:
                    first_img = images_from_client[0] if isinstance(images_from_client[0], str) else None
                if first_img:
                    return jsonify({"imageUrl": first_img}), 200
            except Exception:
                pass
            # Fallback: return text response only
            return jsonify({"text": "".join(text_parts)}), 200

        # Return as data URL for simplest frontend display and persist image URL to chapter if possible
        base64_data = base64.b64encode(image_data).decode("utf-8")
        data_url = f"data:{image_mime};base64,{base64_data}"

        # Optionally update the specified chapter image_url, or fallback to most recent
        try:
            with SessionLocal() as session:
                ch = None
                if chapter_id_from_client:
                    ch = session.get(DBChapter, int(chapter_id_from_client))
                if ch is None:
                    # Fallback: latest chapter of latest story for this user
                    user_id = getattr(g, 'user_id', None)
                    story = None
                    if story_id_from_client:
                        story = session.get(Story, int(story_id_from_client))
                    if story is None:
                        story = (
                            session.query(Story)
                            .filter(Story.user_id == user_id)
                            .order_by(Story.id.desc())
                            .first()
                        )
                    if story:
                        ch = (
                            session.query(DBChapter)
                            .filter(DBChapter.story_id == story.id)
                            .order_by(DBChapter.index_in_story.desc())
                            .first()
                        )
                # At this point, ch may be resolved via direct id or fallback
                if ch is not None:
                    ch.image_url = data_url
                    # Update story cover image to latest
                    try:
                        story = session.get(Story, ch.story_id)
                        if story is not None:
                            story.cover_image_url = data_url
                            # If provided images were sent now and not yet stored, persist on story
                            try:
                                if images_from_client and not getattr(story, 'character_images_json', None):
                                    import json
                                    story.character_images_json = json.dumps([i for i in images_from_client if isinstance(i, str)])
                            except Exception:
                                pass
                    except Exception:
                        pass
                    session.commit()
        except Exception as e:
            print(f"Failed to persist image_url to DB: {e}")

        return jsonify({"imageUrl": data_url}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---- Character Image Generation (stateless) ----
@app.post("/ai/generate-character")
@require_auth
def ai_generate_character():
    """Generate a character image from one input image and a prompt.

    Body JSON: { "prompt": string, "image": string(data URL) }
    Returns: { "imageUrl": dataUrl }
    No DB persistence/retrieval.
    """
    body = request.json or {}
    #prompt = body.get("prompt") or "Generate a friendly, kid-safe character image."
    prompt = " Keep the character's identity and pose. Transform the uploaded portrait into a kid-friendly character. Disney Pixar style."
    prompt = PROMPT_CREATE_CHARACTER
    image_data_url = body.get("image") or None

    # Check credits BEFORE invoking LLM
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return jsonify({"error": "unauthorized"}), 401
    with SessionLocal() as session:
        u = session.get(User, user_id)
        if not u or (u.credits or 0) <= 0:
            return jsonify({"error": "insufficient_credits"}), 402

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "missing_gemini_api_key"}), 400

    if genai is None:
        return jsonify({"error": "google_genai_not_installed"}), 500

    # Helper: decode data URL -> (mime, bytes)
    def decode_data_url(data_url: str):
        try:
            if data_url and data_url.startswith("data:") and ";base64," in data_url:
                header, b64 = data_url.split(",", 1)
                mime = header.split(":", 1)[1].split(";", 1)[0]
                return mime, base64.b64decode(b64)
        except Exception:
            pass
        return None, None

    try:
        mime, blob = decode_data_url(image_data_url) if image_data_url else (None, None)
        if not blob:
            return jsonify({"error": "missing_image"}), 400

        client = genai.Client(api_key=api_key)
        model = "gemini-2.5-flash-image-preview"

        parts = [genai_types.Part.from_text(text=prompt)]
        if hasattr(genai_types.Part, "from_inline_data"):
            parts.append(genai_types.Part.from_inline_data(mime_type=mime or "image/png", data=blob))
        else:
            parts.append(genai_types.Part.from_bytes(data=blob, mime_type=mime or "image/png"))

        contents = [genai_types.Content(role="user", parts=parts)]
        
        # Try with response_modalities first, fallback to default if it fails
        try:
            generate_content_config = genai_types.GenerateContentConfig(response_modalities=["IMAGE"])
            out_data = None
            out_mime = None
            for chunk in client.models.generate_content_stream(model=model, contents=contents, config=generate_content_config):
                try:
                    cand = chunk.candidates[0]
                    if cand and cand.content and cand.content.parts:
                        part0 = cand.content.parts[0]
                        if getattr(part0, "inline_data", None) and getattr(part0.inline_data, "data", None):
                            out_data = part0.inline_data.data
                            out_mime = getattr(part0.inline_data, "mime_type", None) or "image/png"
                            break
                except Exception:
                    continue
        except Exception as e:
            print(f"Error with response_modalities, trying without: {e}")
            # Fallback: try without response_modalities
            try:
                generate_content_config = genai_types.GenerateContentConfig()
                out_data = None
                out_mime = None
                for chunk in client.models.generate_content_stream(model=model, contents=contents, config=generate_content_config):
                    try:
                        cand = chunk.candidates[0]
                        if cand and cand.content and cand.content.parts:
                            part0 = cand.content.parts[0]
                            if getattr(part0, "inline_data", None) and getattr(part0.inline_data, "data", None):
                                out_data = part0.inline_data.data
                                out_mime = getattr(part0.inline_data, "mime_type", None) or "image/png"
                                break
                    except Exception:
                        continue
            except Exception as e2:
                print(f"Error without response_modalities: {e2}")
                return jsonify({"error": f"Generation failed: {str(e2)}"}), 500

        if not out_data:
            return jsonify({"error": "generation_failed"}), 500

        base64_data = base64.b64encode(out_data).decode("utf-8")
        data_url = f"data:{out_mime};base64,{base64_data}"
        
        # Decrement credits after successful generation
        try:
            with SessionLocal() as session:
                u = session.get(User, user_id)
                if u:
                    u.credits = max(0, (u.credits or 0) - 1)
                    session.commit()
        except Exception as e:
            print(f"Failed to decrement credits: {e}")
        
        return jsonify({"imageUrl": data_url}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---- Character Image Generation from Text (stateless) ----
@app.post("/ai/generate-character-from-text")
@require_auth
def ai_generate_character_from_text():
    """Generate a character image from text description only.

    Body JSON: { "prompt": string }
    Returns: { "imageUrl": dataUrl }
    No DB persistence/retrieval.
    """
    body = request.json or {}
    prompt = body.get("prompt") or "Create a friendly, kid-safe character image."
    # Add white background instruction to the prompt
    prompt = f"{prompt} Use a white background. Do not add any object, just generate the character."

    # Check credits BEFORE invoking LLM
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return jsonify({"error": "unauthorized"}), 401
    with SessionLocal() as session:
        u = session.get(User, user_id)
        if not u or (u.credits or 0) <= 0:
            return jsonify({"error": "insufficient_credits"}), 402

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "missing_gemini_api_key"}), 400

    if genai is None:
        return jsonify({"error": "google_genai_not_installed"}), 500

    try:
        client = genai.Client(api_key=api_key)
        model = "gemini-2.5-flash-image-preview"

        parts = [genai_types.Part.from_text(text=prompt)]
        contents = [genai_types.Content(role="user", parts=parts)]
        generate_content_config = genai_types.GenerateContentConfig(response_modalities=["IMAGE"])

        out_data = None
        out_mime = None
        for chunk in client.models.generate_content_stream(model=model, contents=contents, config=generate_content_config):
            try:
                cand = chunk.candidates[0]
                if cand and cand.content and cand.content.parts:
                    part0 = cand.content.parts[0]
                    if getattr(part0, "inline_data", None) and getattr(part0.inline_data, "data", None):
                        out_data = part0.inline_data.data
                        out_mime = getattr(part0.inline_data, "mime_type", None) or "image/png"
                        break
            except Exception:
                continue

        if not out_data:
            return jsonify({"error": "generation_failed"}), 500

        base64_data = base64.b64encode(out_data).decode("utf-8")
        data_url = f"data:{out_mime};base64,{base64_data}"
        
        # Decrement credits after successful generation
        try:
            with SessionLocal() as session:
                u = session.get(User, user_id)
                if u:
                    u.credits = max(0, (u.credits or 0) - 1)
                    session.commit()
        except Exception as e:
            print(f"Failed to decrement credits: {e}")
        
        return jsonify({"imageUrl": data_url}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Save character image (explicit)
@app.post("/characters")
@require_auth
def save_character_image():
    body = request.get_json(silent=True) or {}
    image = body.get("image")
    name = (body.get("name") or None)
    if not image or not isinstance(image, str):
        return jsonify({"error": "missing_image"}), 400
    try:
        with SessionLocal() as session:
            rec = CharacterImage(user_id=g.user_id, image_data=image, name=name)
            session.add(rec)
            session.commit()
            return jsonify({"id": rec.id, "image": rec.image_data, "name": rec.name}), 201
    except Exception as e:
        return jsonify({"error": "save_failed", "detail": str(e)}), 500

# Delete character image
@app.delete("/characters/<int:character_id>")
@require_auth
def delete_character_image(character_id: int):
    try:
        with SessionLocal() as session:
            character = session.query(CharacterImage).filter(
                CharacterImage.id == character_id,
                CharacterImage.user_id == g.user_id
            ).first()
            
            if not character:
                return jsonify({"error": "character_not_found"}), 404
            
            session.delete(character)
            session.commit()
            return jsonify({"message": "Character deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": "delete_failed", "detail": str(e)}), 500

# ---------- Stories endpoints ----------
@app.get("/stories")
@require_auth
def list_stories():
    with SessionLocal() as session:
        stories = (
            session.query(Story)
            .filter(Story.user_id == g.user_id)
            .order_by(Story.created_at.desc())
            .all()
        )
        result = []
        for s in stories:
            count = session.query(DBChapter).filter(DBChapter.story_id == s.id).count()
            result.append({
                "id": s.id,
                "title": s.title,
                "status": s.status,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "chapters_count": count,
                "cover_image_url": getattr(s, "cover_image_url", None),
            })
        return jsonify(result)

@app.get("/stories/<int:story_id>/chapters")
@require_auth
def list_story_chapters(story_id: int):
    with SessionLocal() as session:
        story = session.get(Story, story_id)
        if not story or story.user_id != g.user_id:
            return jsonify({"error": "not_found"}), 404
        chapters = (
            session.query(DBChapter)
            .filter(DBChapter.story_id == story_id)
            .order_by(DBChapter.index_in_story.asc())
            .all()
        )
        return jsonify([
            {
                "id": ch.id,
                "index": ch.index_in_story,
                "title": ch.title,
                "text": ch.text,
                "image_url": ch.image_url,
            }
            for ch in chapters
        ])

@app.get("/stories/<int:story_id>")
@require_auth
def get_story(story_id: int):
    with SessionLocal() as session:
        story = session.get(Story, story_id)
        if not story or story.user_id != g.user_id:
            return jsonify({"error": "not_found"}), 404
        count = session.query(DBChapter).filter(DBChapter.story_id == story.id).count()
        return jsonify({
            "id": story.id,
            "title": story.title,
            "status": story.status,
            "chapters_count": count,
            "created_at": story.created_at.isoformat() if story.created_at else None,
            "cover_image_url": getattr(story, "cover_image_url", None),
        })

@app.delete("/stories/<int:story_id>")
@require_auth
def delete_story(story_id: int):
    with SessionLocal() as session:
        story = session.get(Story, story_id)
        if not story or story.user_id != g.user_id:
            return jsonify({"error": "not_found"}), 404
        # Using cascade delete on relationship removes chapters as well
        session.delete(story)
        session.commit()
        return jsonify({"ok": True, "deleted_story_id": story_id}), 200

# --------- Account deletion ---------
@app.delete("/account")
@require_auth
def delete_account():
    body = request.get_json(silent=True) or {}
    reason_choice = (body.get("reason_choice") or None)
    reason_text = (body.get("reason_text") or None)
    with SessionLocal() as session:
        user = session.get(User, g.user_id)
        if not user:
            return jsonify({"error": "not_found"}), 404
        # Persist deletion reason without any user identifier
        try:
            rec = AccountDeletion(reason_choice=reason_choice, reason_text=reason_text)
            session.add(rec)
            session.flush()
        except Exception as e:
            print(f"AccountDeletion record failed: {e}")
        # Delete user's character images
        character_images = session.query(CharacterImage).filter(CharacterImage.user_id == user.id).all()
        for ci in character_images:
            session.delete(ci)
        
        # Delete user's credit additions
        credit_additions = session.query(CreditAddition).filter(CreditAddition.user_id == user.id).all()
        for ca in credit_additions:
            session.delete(ca)
        
        # Delete user's stories (chapters cascade via relationship)
        stories = session.query(Story).filter(Story.user_id == user.id).all()
        for s in stories:
            session.delete(s)
        
        # Finally delete the user
        session.delete(user)
        session.commit()
        return jsonify({"ok": True}), 200

if __name__ == "__main__":
    app.run(debug=True)



