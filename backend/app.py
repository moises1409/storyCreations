from flask import Flask, request, jsonify, g
from flask_cors import CORS
import os
from datetime import date
from dotenv import load_dotenv
import requests
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from db import SessionLocal
from models import User, Story, Chapter as DBChapter, Base, AccountDeletion, CreditAddition, CharacterImage
from functools import wraps
from auth_utils import hash_password, verify_password
from jwt_utils import create_access_token, decode_token, create_refresh_token, decode_refresh_token, create_password_reset_token, decode_password_reset_token
import base64
import mimetypes
try:
    from google import genai
    from google.genai import types as genai_types
except Exception:
    genai = None
    genai_types = None
from io import BytesIO
import logging
from openai import OpenAI
from pydantic import BaseModel
from prompts import PROMPT_USER1, PROMPT_USER2, PROMPT_SYSTEM_SEED, PROMPT_SYSTEM_CHAPTER, PROMPT_SYSTEM_CHAPTER_FINAL, PROMPT_CREATE_CHARACTER
from storage_utils import upload_image_and_thumbnail, parse_data_url, upload_bytes, sign_blob_url, download_blob_bytes_from_url, make_public_url

# Audio generation control
AUDIO_ENABLED = os.getenv('AUDIO', '0') == '1'
import asyncio
import concurrent.futures
import base64

client = OpenAI()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')


try:
    load_dotenv(verbose=True)
except Exception as e:
    print(f"Warning: Could not load .env file: {e}")
    print("Continuing without .env file...")

class Chapter(BaseModel):
   text: str
   title_story: str
   title_chapter: str
   image_prompt: str
   choices: list[str] | None = None

def get_voice_id_for_language(language: str = None) -> str | None:
    """Get the appropriate voice ID based on language"""
    # Normalize language code: take primary subtag (e.g., 'fr-FR' -> 'fr')
    code = (language or '').strip().lower()
    if not code:
        return os.getenv('ELEVENLABS_VOICE_ID')
    if '-' in code:
        code = code.split('-', 1)[0]
    if '_' in code:
        code = code.split('_', 1)[0]

    voice_mapping = {
        'en': os.getenv('ELEVENLABS_VOICE_ID_EN', os.getenv('ELEVENLABS_VOICE_ID')),
        'es': os.getenv('ELEVENLABS_VOICE_ID_ES', os.getenv('ELEVENLABS_VOICE_ID')),
        'fr': os.getenv('ELEVENLABS_VOICE_ID_FR', os.getenv('ELEVENLABS_VOICE_ID')),
        'de': os.getenv('ELEVENLABS_VOICE_ID_DE', os.getenv('ELEVENLABS_VOICE_ID')),
        'it': os.getenv('ELEVENLABS_VOICE_ID_IT', os.getenv('ELEVENLABS_VOICE_ID')),
    }
    return voice_mapping.get(code, os.getenv('ELEVENLABS_VOICE_ID'))

def generate_audio_elevenlabs(text: str, language: str = None, user_id: int | None = None) -> str | None:
    """Generate audio using ElevenLabs and return a Blob URL (mp3)"""
    try:
        api_key = os.getenv('ELEVENLABS_API_KEY')
        
        # Get voice ID based on language
        print(f"Generating audio for language: {language}")
        voice_id = get_voice_id_for_language(language)
        print(f"Voice ID: {voice_id}")
        
        if not api_key or not voice_id:
            print("ElevenLabs configuration not found")
            return None
        
        # Clean and validate text
        if not text or not text.strip():
            print("Empty text provided for audio generation")
            return None
        
        cleaned_text = text.strip()
        if language == 'fr':
            cleaned_text = cleaned_text.replace('…', '...')
        
        # Limit text length to avoid API limits
        if len(cleaned_text) > 5000:
            cleaned_text = cleaned_text[:5000] + "..."
            print(f"Text truncated to 5000 characters for language: {language}")
        
        headers = {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': api_key
        }
        
        body = {
            'text': cleaned_text,
            'model_id': 'eleven_flash_v2_5',
            'voice_settings': {
                'stability': 0.5,
                'similarity_boost': 0.5,
                'style': 0.0,
                'use_speaker_boost': True
            }
        }
        
        response = requests.post(
            f'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}', 
            headers=headers, json=body, timeout=30
        )
        
        if response.status_code == 200:
            # Upload MP3 bytes to Blob and return URL
            try:
                prefix = f"users/{user_id or 'anon'}/audio"
                url = upload_bytes(response.content, "audio/mpeg", prefix=prefix, extension="mp3")
                from storage_utils import sign_blob_url as _sign
                return _sign(url)
            except Exception as e:
                print(f"Audio upload failed: {e}")
                return None
        else:
            print(f"Failed to generate speech: {response.status_code}")
            print(f"Response content: {response.text}")
            print(f"Voice ID used: {voice_id}")
            print(f"Language: {language}")
            print(f"Text length: {len(text)} characters")
            return None
            
    except Exception as e:
        print(f"Error generating audio: {e}")
        return None
  

app = Flask(__name__)
CORS(
    app,
    resources={r"/*": {"origins": "*"}},
    supports_credentials=True,
    allow_headers=["Authorization", "Content-Type"],
    methods=["GET", "POST", "OPTIONS", "DELETE", "PATCH"]
)

# Environment defaults for local Azurite if not provided
if not os.getenv("AZURE_STORAGE_CONNECTION_STRING"):
    # Default Azurite connection string for local dev
    os.environ["AZURE_STORAGE_CONNECTION_STRING"] = (
        "DefaultEndpointsProtocol=http;"
        "AccountName=devstoreaccount1;"
        "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;"
        "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;"
        "QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;"
        "TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;"
    )
if not os.getenv("AZURE_STORAGE_CONTAINER"):
    os.environ["AZURE_STORAGE_CONTAINER"] = "images"

@app.route("/test", methods=["GET"])
def get_api_test():
    logging.debug("esto es un test de contacto solo")
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

@app.post("/auth/forgot-password")
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "missing_email"}), 400
    with SessionLocal() as session:
        user = session.query(User).filter(User.email == email).first()
        if not user:
            # Avoid account enumeration
            return jsonify({"ok": True}), 200
        token = create_password_reset_token(user.id)
        # In production, email the token link. For now, return the token.
        return jsonify({"ok": True, "reset_token": token}), 200

@app.post("/auth/reset-password")
def reset_password():
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    new_password = (data.get("password") or "").strip()
    if not token or not new_password:
        return jsonify({"error": "missing_fields"}), 400
    try:
        payload = decode_password_reset_token(token)
        user_id = int(payload.get("sub"))
    except Exception:
        return jsonify({"error": "invalid_or_expired"}), 400
    with SessionLocal() as session:
        user = session.get(User, user_id)
        if not user:
            return jsonify({"error": "invalid_user"}), 400
        user.password_hash = hash_password(new_password)
        session.commit()
    return jsonify({"ok": True}), 200

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
    """Return character entries for this user.

    Default returns items with image URLs for backwards compatibility.
    You can pass include_images=0 to omit the legacy images array.
    """
    try:
        include_images = (request.args.get("include_images", "1") != "0")
        with SessionLocal() as session:
            rows = (
                session.query(CharacterImage.id, CharacterImage.image_data, CharacterImage.name)
                .filter(CharacterImage.user_id == g.user_id)
                .order_by(CharacterImage.created_at.desc())
                .all()
            )
            items = [
                {"id": r[0], "image": sign_blob_url(r[1]) if isinstance(r[1], str) else r[1], "name": r[2]}
                for r in rows
            ]
            out = {"items": items}
            if include_images:
                out["images"] = [sign_blob_url(r[1]) if isinstance(r[1], str) else r[1] for r in rows]
            return jsonify(out), 200
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
    # Resolve plan->credits from environment
    def _plan_credits_for(plan_id: str, default_val: int) -> int:
        try:
            # Expected env names: PLAN_START_CREDITS, PLAN_PRO_CREDITS, PLAN_MAX_CREDITS
            key_map = {
                "starter": "PLAN_START_CREDITS",
                "pro": "PLAN_PRO_CREDITS",
                "max": "PLAN_MAX_CREDITS",
            }
            env_key = key_map.get(plan_id, "")
            if env_key:
                return int(os.environ.get(env_key, str(default_val)))
            return default_val
        except Exception:
            return default_val
    plan_map = {
        "starter": _plan_credits_for("starter", 50),
        "pro": _plan_credits_for("pro", 100),
        "max": _plan_credits_for("max", 150),
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
        return jsonify({"ok": True, "credits": user.credits, "added": int(add), "user": user.to_dict()})

@app.get("/billing/credit-costs")
@require_auth
def get_credit_costs():
    """Expose current credit costs configured by environment variables.
    Returns: { chapter: int, audio: int }
    """
    try:
        chapter_cost = int(os.environ.get("CREDITS_CHAPTER", "2"))
    except Exception:
        chapter_cost = 2
    try:
        audio_cost = int(os.environ.get("CREDITS_AUDIO", "1"))
    except Exception:
        audio_cost = 1
    try:
        image_cost = int(os.environ.get("CREDITS_IMAGE", "1"))
    except Exception:
        image_cost = 1
    return jsonify({"chapter": chapter_cost, "audio": audio_cost, "image": image_cost})

@app.get("/billing/plans")
def get_billing_plans():
    """Return available credit plans and their prices based on env variables.
    Env:
      CREDITS_PLAN_STARTER, PRICE_PLAN_STARTER
      CREDITS_PLAN_PRO, PRICE_PLAN_PRO
      CREDITS_PLAN_MAX, PRICE_PLAN_MAX
      CURRENCY (default CHF)
    """
    def _int_env(name: str, default_val: int) -> int:
        try:
            return int(os.environ.get(name, str(default_val)))
        except Exception:
            return default_val
    def _str_env(name: str, default_val: str) -> str:
        try:
            return str(os.environ.get(name, default_val))
        except Exception:
            return default_val
    plans = [
        {
            "id": "starter",
            "name": "Starter",
            "credits": _int_env("PLAN_START_CREDITS", 50),
            "price": _str_env("PLAN_START_PRICE", "10"),
            "currency": _str_env("PLAN_CURRENCY", "CHF"),
        },
        {
            "id": "pro",
            "name": "Pro",
            "credits": _int_env("PLAN_PRO_CREDITS", 100),
            "price": _str_env("PLAN_PRO_PRICE", "17"),
            "currency": _str_env("PLAN_CURRENCY", "CHF"),
        },
        {
            "id": "max",
            "name": "Max",
            "credits": _int_env("PLAN_MAX_CREDITS", 150),
            "price": _str_env("PLAN_MAX_PRICE", "25"),
            "currency": _str_env("PLAN_CURRENCY", "CHF"),
        },
    ]
    return jsonify({"plans": plans})

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
    logging.info("GENERATING FIRST CHAPTER")
    body = request.json or {}
    topic = body.get("prompt") or (
        "a brave young fox in a moonlit enchanted forest"
    )
    # New: support character IDs instead of direct images
    character_ids = body.get("character_ids") or []
    # Optional: include character objects to avoid DB lookups for names
    characters = body.get("characters") or []  # [{id, name}]
    # Optional: include character images to persist on story immediately
    character_images = body.get("character_images") or []  # [dataUrl or URL]
    
    if not isinstance(character_ids, list):
        character_ids = []
    # New: support language selection
    language = body.get("language") or ""
    # Do not persist here; commit happens in /ai/commit-seed
    persist = False

    # Resolve character names for prompt context (prefer client-provided to avoid DB reads)
    character_names: list[str] = []
    try:
        # Use provided characters first
        if isinstance(characters, list) and characters:
            for c in characters:
                try:
                    name = (c.get("name") or "").strip()
                    if name:
                        character_names.append(name)
                except Exception:
                    continue
        # Fallback to DB only if no names were provided and ids exist
        if not character_names and character_ids:
            with SessionLocal() as session:
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
                logging.info(f"User generating seed: {u.id} - {u.email} - {u.credits}")
                # If persisting now, require 1 credit; if deferring, only check that user has at least 1 (soft check)
                # Final deduction will happen in commit endpoint.
                try:
                    required_min = int(os.environ.get("CREDITS_CHAPTER", "2"))
                except Exception:
                    required_min = 2
                if not u or (u.credits or 0) < required_min:
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
                model="gpt-4.1-nano-2025-04-14",
                input=[
                    {"role": "system", "content": PROMPT_SYSTEM_SEED},
                    {"role": "user", "content": PROMPT_USER1 + enriched_topic},
                    {"role": "user", "content": PROMPT_USER2 + language}
                ],
                text_format=Chapter,
            )
            response = completion.output_parsed
            response_dict = response.model_dump()
            
            # Derive a minimal bible from seed output and inputs
            try:
                bible = {
                    "style": {
                        "language": language or None,
                        "tone": "kid-friendly, positive, vivid",
                    },
                    "characters": [
                        {"id": c.get("id"), "name": (c.get("name") or None)} for c in (characters or []) if isinstance(c, dict)
                    ],
                    "constraints": [
                        "Do not change character names, age, outfit, or hair color",
                        "Keep continuity of places and items introduced earlier"
                    ],
                }
                response_dict["bible_json"] = bible
                logging.info(f"Response from LLM seed: {response_dict}")
            except Exception:
                pass
            
            # Always return generated content; persistence is handled by /ai/commit-seed
            return jsonify(response_dict)
        except Exception as e:
            print(f"Failed to generate story: {e}")
            return jsonify({"error": "chapter_generation_failed", "detail": str(e)}), 500
    else:
        return jsonify({'error': 'No topic provided'}), 400

@app.post("/ai/generate-chapter")
@require_auth
def ai_generate_chapter():
    logging.info("GENERATING NEXT CHAPTER")
    body = request.json or {}
    topic = body.get("prompt") or (
        "a brave young fox in a moonlit enchanted forest"
    )
    history = body.get("history") or []  # list of previous chapter texts
    if not isinstance(history, list):
        history = []
    mode = (body.get("mode") or "continue").lower()
    logging.info(f"Mode Chapter: {mode}")
    story_id_from_client = body.get("story_id")
    # Allow deferred persistence
    persist = True
    try:
        persist = bool(body.get("persist", True))
    except Exception:
        persist = True
    logging.info(f"Persist in generate chapter: {persist}")
    if topic:
        try:
            # Check credits BEFORE invoking LLM
            user_id = getattr(g, 'user_id', None)
            if not user_id:
                return jsonify({"error": "unauthorized"}), 401
            with SessionLocal() as session:
                u = session.get(User, user_id)
                logging.info(f"User generating chapter: {u.id} - {u.email} - {u.credits}")
                # If persisting now, require at least 2 credits (text + image);
                # if only preview (persist=False), allow with >0 to generate text preview.
                try:
                    required_min = int(os.environ.get("CREDITS_CHAPTER", "2"))
                except Exception:
                    required_min = 2
                if not u or (u.credits or 0) < required_min:
                    return jsonify({"error": "insufficient_credits"}), 402

            # Get story language for prompt generation
            story_language = None
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
                if story:
                    story_language = story.language

            # Build context message with previous chapters and bible
            previous_text = "\n\n".join([f"Chapter {i+1}: {t}" for i, t in enumerate(history) if isinstance(t, str) and t.strip()])
            bible_text = None
            try:
                with SessionLocal() as s2:
                    st = None
                    if story_id_from_client:
                        st = s2.get(Story, int(story_id_from_client))
                    if st and getattr(st, 'bible_json', None):
                        import json
                        bible_text = st.bible_json
            except Exception:
                bible_text = None
            
            # Choose prompt based on requested mode
            if mode == "final":
                system_prompt = PROMPT_SYSTEM_CHAPTER_FINAL
            else:
                system_prompt = PROMPT_SYSTEM_CHAPTER
            messages = [
                {"role": "system", "content": system_prompt},
            ]
            if bible_text:
                messages.append({"role": "user", "content": f"Story bible (authoritative context, do not contradict):\n{bible_text}"})
            if previous_text:
                messages.append({"role": "user", "content": f"Previous chapters so far:\n{previous_text}"})
            
            # Build user message with language instruction if available
            user_message = f"Continue the story. Next chapter idea: {topic}"
            if story_language:
                user_message += f"\n\n{PROMPT_USER2} {story_language}"
            messages.append({"role": "user", "content": user_message})
            
            completion = client.responses.parse(
                model="gpt-4.1-nano-2025-04-14",
                #model="gpt-5-nano",
                input=messages,
                text_format=Chapter,
            )
            response = completion.output_parsed
            response_dict = response.model_dump()
            logging.info(f"Response from LLM chapter: {response_dict}")

            # Always return generated content; persistence handled by /ai/commit-chapter
            return jsonify(response_dict)
        except Exception as e:
            print(f"Failed to generate story: {e}")
            return jsonify({"error": "chapter_generation_failed", "detail": str(e)}), 500
    else:
        return jsonify({'error': 'No topic provided'}), 400

@app.post("/ai/edit-chapter")
@require_auth
def ai_edit_chapter():
    """Edit an existing chapter by regenerating it with a new user prompt"""
    body = request.json or {}
    chapter_id = body.get("chapter_id")
    new_prompt = body.get("prompt") or ""
    logging.info(f"EDIT CHAPTER REQUEST - chapter_id: {chapter_id}, prompt: '{new_prompt}'")
    
    #print(f"Edit chapter request - chapter_id: {chapter_id}, prompt: '{new_prompt}'")
    
    if not chapter_id or not new_prompt.strip():
        return jsonify({"error": "chapter_id and prompt are required", "received": {"chapter_id": chapter_id, "prompt": new_prompt}}), 400
    
    try:
        # Always deferred persistence to align with new chapter flow
        persist = False
        # Check credits BEFORE invoking LLM
        user_id = getattr(g, 'user_id', None)
        if not user_id:
            return jsonify({"error": "unauthorized"}), 401
        
        with SessionLocal() as session:
            u = session.get(User, user_id)
            logging.info(f"User editing chapter: {u.id} - {u.email} - {u.credits}")
            # Require at least 2 credits available before starting edit flow
            try:
                required_min = int(os.environ.get("CREDITS_CHAPTER", "2"))
            except Exception:
                required_min = 2
            if not u or (u.credits or 0) < required_min:
                return jsonify({"error": "insufficient_credits"}), 402
            
            # Get the chapter and verify ownership
            chapter = session.get(DBChapter, int(chapter_id))
            if not chapter:
                return jsonify({"error": "chapter_not_found"}), 404
            
            story = session.get(Story, chapter.story_id)
            if not story or story.user_id != user_id:
                return jsonify({"error": "unauthorized"}), 403
            
            # Get story language for prompt generation
            story_language = story.language
            
            # Get previous chapters for context (excluding current chapter)
            previous_chapters = (
                session.query(DBChapter)
                .filter(DBChapter.story_id == story.id)
                .filter(DBChapter.index_in_story < chapter.index_in_story)
                .order_by(DBChapter.index_in_story.asc())
                .all()
            )
            
            # Build context message with previous chapters
            previous_text = "\n\n".join([f"Chapter {ch.index_in_story}: {ch.text}" for ch in previous_chapters if ch.text.strip()])
            
            # Choose prompt strategy: if first chapter, use SEED flow to respect story initiation
            is_final = chapter.is_final
            is_first = (chapter.index_in_story == 1)

            if is_first:
                logging.info(f"User editing first chapter")
                # Enrich prompt with character names if available on the story
                enriched_prompt = new_prompt
                try:
                    import json
                    character_names: list[str] = []
                    ids: list[int] = []
                    if getattr(story, 'character_ids_json', None):
                        parsed_ids = json.loads(story.character_ids_json)
                        if isinstance(parsed_ids, list):
                            for cid in parsed_ids:
                                try:
                                    ids.append(int(cid))
                                except Exception:
                                    continue
                    if ids:
                        rows = (
                            session.query(CharacterImage.name)
                            .filter(CharacterImage.user_id == user_id)
                            .filter(CharacterImage.id.in_(ids))
                            .all()
                        )
                        character_names = [r[0] for r in rows if (r[0] or '').strip()]
                    if character_names:
                        try:
                            enriched_prompt = f"{new_prompt}. Characters: {', '.join(character_names)}."
                        except Exception:
                            enriched_prompt = new_prompt
                except Exception:
                    enriched_prompt = new_prompt

                messages = [
                    {"role": "system", "content": PROMPT_SYSTEM_SEED},
                    {"role": "user", "content": PROMPT_USER1 + enriched_prompt},
                    {"role": "user", "content": PROMPT_USER2 + (story_language or "")},
                ]
            else:
                logging.info(f"User editing regular chapter")
                # Regular chapter edit flow
                system_prompt = PROMPT_SYSTEM_CHAPTER_FINAL if is_final else PROMPT_SYSTEM_CHAPTER
                messages = [
                    {"role": "system", "content": system_prompt},
                ]
                if previous_text:
                    messages.append({"role": "user", "content": f"Previous chapters so far:\n{previous_text}"})
                # Build user message with language instruction if available
                user_message = f"Continue the story. Next chapter idea: {new_prompt}"
                if story_language:
                    user_message += f"\n\n{PROMPT_USER2} {story_language}"
                messages.append({"role": "user", "content": user_message})

            completion = client.responses.parse(
                model="gpt-4.1-nano-2025-04-14",
                input=messages,
                text_format=Chapter,
            )
            response = completion.output_parsed
            response_dict = response.model_dump()
            logging.info(f"Response from LLM chapter in editing chapter: {response_dict}")
            # Do not persist or deduct here; commit will handle it
            response_dict.update({
                "chapter_id": chapter.id,
                "user_prompt": new_prompt
            })

        return jsonify(response_dict)
    except Exception as e:
        print(f"Failed to edit chapter: {e}")
        return jsonify({"error": "chapter_edit_failed", "detail": str(e)}), 500

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
    mode = (body.get("mode") or "").strip().lower()
    # Enforce white background for character refinements
    if mode == "character_refine" and "white background" not in (prompt or "").lower():
        prompt = f"{prompt} Use a white background."
    # Always encourage reference usage
    prompt = f"{prompt}. Use the provided reference images of the characters to ensure consistency."
    
    story_id_from_client = body.get("story_id")
    chapter_id_from_client = body.get("chapter_id")
    logging.info(f"GENERATING IMAGE CHAPTER: {story_id_from_client} and chapter: {chapter_id_from_client}, mode: {mode}, prompt: {prompt}")
    # Control persistence: allow returning image without DB writes when persist=false (e.g., deferred commit)
    persist = True
    try:
        # Credit check for regenerate/character_refine mode
        if mode in ("regenerate", "character_refine"):
            logging.info(f"Checking credits for regenerate/character_refine mode")
            user_id = getattr(g, 'user_id', None)
            if not user_id:
                return jsonify({"error": "unauthorized"}), 401
            with SessionLocal() as session:
                u = session.get(User, user_id)
                try:
                    image_cost = int(os.environ.get("CREDITS_IMAGE", "1"))
                except Exception:
                    image_cost = 1
                if not u or (u.credits or 0) < image_cost:
                    return jsonify({"error": "insufficient_credits"}), 402
        persist = bool(body.get("persist", True))
    except Exception:
        persist = True
    images_from_client = body.get("images") or []
    #print(f"images_from_client: {images_from_client}")
   
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
                            logging.info(f"id_list of characters: {id_list}")
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

        logging.info(f"images reference characters: {images_from_client}")
        client = genai.Client(api_key=api_key)
        model = "gemini-2.5-flash-image-preview"

        # Helper: accept either data URL (base64) or http(s) URL -> (mime, bytes)
        def decode_image_ref(ref: str):
            try:
                #logging.debug(f"decode_image_ref: ref={ref}")
                if isinstance(ref, str):
                    # Data URL path
                    if ref.startswith("data:") and ";base64," in ref:
                        header, b64 = ref.split(",", 1)
                        mime = header.split(":", 1)[1].split(";", 1)[0]
                        return mime, base64.b64decode(b64)
                    # Blob/Azure URL via SDK (avoids 403, supports private containers)
                    if ref.startswith("http://") or ref.startswith("https://"):
                        try:
                            blob_bytes, blob_mime = download_blob_bytes_from_url(ref)
                            if blob_bytes:
                                return blob_mime or "image/png", blob_bytes
                        except Exception:
                            pass
                        # Fallback to HTTP GET with browser-like headers
                        try:
                            public_ref = make_public_url(ref)
                            r = requests.get(public_ref, timeout=12, headers={
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
                                "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                                "Accept-Language": "en-US,en;q=0.9"
                            })
                            if r.status_code == 200 and r.content:
                                mime = r.headers.get("Content-Type") or mimetypes.guess_type(public_ref)[0] or "image/png"
                                return mime, r.content
                        except Exception:
                            return None, None
            except Exception:
                pass
            return None, None
        #print(f"generate-image, antes de build user parts -- images_from_client: {images_from_client}")
        # Build user parts: text + optional inline images from client
        user_parts = [genai_types.Part.from_text(text=prompt)]
        for img in images_from_client[:3]:
            if isinstance(img, str):
                mime, blob = decode_image_ref(img)
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
                    # Scan all parts; image may not be in the first position
                    for part in cand.content.parts:
                        if getattr(part, "inline_data", None) and getattr(part.inline_data, "data", None):
                            image_data = part.inline_data.data
                            image_mime = getattr(part.inline_data, "mime_type", None) or "image/png"
                            break
                    if not image_data and getattr(chunk, "text", None):
                        text_parts.append(chunk.text)
            except Exception:
                continue

        # Fallback: try non-streaming call; if no image, retry once with same params
        if not image_data:
            for _ in range(2):
                try:
                    sync_resp = client.models.generate_content(model=model, contents=contents, config=generate_content_config)
                    cand = None
                    try:
                        cand = sync_resp.candidates[0]
                    except Exception:
                        cand = None
                    if cand and cand.content and getattr(cand.content, "parts", None):
                        for part in cand.content.parts:
                            if getattr(part, "inline_data", None) and getattr(part.inline_data, "data", None):
                                image_data = part.inline_data.data
                                image_mime = getattr(part.inline_data, "mime_type", None) or "image/png"
                                break
                    if image_data:
                        break
                except Exception:
                    continue

        if not image_data:
            logging.info(f"No image data found in the response from Google")
            # If client provided an image, prefer that (upload to blob for consistency)
            try:
                first_img = None
                if images_from_client:
                    first_img = images_from_client[0] if isinstance(images_from_client[0], str) else None
                if first_img:
                    # Accept URL or data URL for fallback upload
                    mime0, blob0 = decode_image_ref(first_img)
                    if blob0:
                        orig_url_raw, thumb_url_raw = upload_image_and_thumbnail(blob0, mime0 or "image/png", prefix=f"users/{getattr(g, 'user_id', 'anon')}/stories")
                        return jsonify({
                            "imageUrl": sign_blob_url(orig_url_raw),
                            "thumbnailUrl": sign_blob_url(thumb_url_raw)
                        }), 200
            except Exception:
                pass
            # Fallback: return text response only
            return jsonify({"text": "".join(text_parts)}), 200

        # Decide whether to generate a thumbnail based ONLY on client intent:
        # - make_thumbnail=true OR chapter_id == 1 (seed or seed-regenerate)
        try:
            chapter_is_seed = False
            try:
                chapter_is_seed = int(chapter_id_from_client) == 1
            except Exception:
                chapter_is_seed = False
            should_generate_thumbnail = bool(body.get("make_thumbnail")) or chapter_is_seed
        except Exception:
            should_generate_thumbnail = False
        logging.info(f"Should generate thumbnail in generate image: {should_generate_thumbnail}")
        # Upload original (and thumbnail only if needed) to Azure Blob Storage
        try:
            user_id = getattr(g, 'user_id', None)
            if should_generate_thumbnail:
                orig_url_raw, thumb_url_raw = upload_image_and_thumbnail(image_data, image_mime or "image/png", prefix=f"users/{user_id}/stories")
            else:
                # Only original image for non-seed chapters
                from storage_utils import _guess_ext_from_mime  # local helper
                original_ext = _guess_ext_from_mime(image_mime or "image/png")
                orig_url_raw = upload_bytes(image_data, image_mime or "image/png", prefix=f"users/{user_id}/stories", extension=original_ext)
                thumb_url_raw = None
            # Sign for immediate client usage, but persist raw URLs in DB
            orig_url_signed = sign_blob_url(orig_url_raw)
            thumb_url_signed = sign_blob_url(thumb_url_raw) if thumb_url_raw else None
        except Exception as e:
            return jsonify({"error": f"upload_failed: {str(e)}"}), 500

        # Optionally update DB unless persisting is deferred
        logging.info(f"Persist in generate image: {persist}")
        if persist:
            try:
                with SessionLocal() as session:
                    ch = None
                    if chapter_id_from_client:
                        ch = session.get(DBChapter, int(chapter_id_from_client))
                    if ch is None:
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
                    if ch is not None:
                        # Persist raw URL without SAS; responses will sign on demand
                        ch.image_url = orig_url_raw
                        try:
                            story = session.get(Story, ch.story_id)
                            if story is not None:
                                # Only set cover on seed (first chapter) or when a thumbnail was generated
                                try:
                                    if thumb_url_raw and getattr(ch, 'index_in_story', None) == 1:
                                        story.cover_image_url = thumb_url_raw
                                except Exception:
                                    pass
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

        # Deduct 1 credit on explicit regenerate or character_refine modes only
        if mode in ("regenerate", "character_refine"):
            try:
                with SessionLocal() as session:
                    u = session.get(User, getattr(g, 'user_id', None))
                    if u:
                        try:
                            image_cost = int(os.environ.get("CREDITS_IMAGE", "1"))
                        except Exception:
                            image_cost = 1
                        u.credits = max(0, (u.credits or 0) - image_cost)
                        session.commit()
            except Exception:
                pass

        return jsonify({"imageUrl": orig_url_signed, "thumbnailUrl": thumb_url_signed}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---- Commit chapter: persist text+image for a subsequent chapter ----
@app.post("/ai/commit-chapter")
@require_auth
def ai_commit_chapter():
    body = request.json or {}
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return jsonify({"error": "unauthorized"}), 401

    story_id = body.get("story_id")
    if not story_id:
        return jsonify({"error": "story_id_required"}), 400

    text = body.get("text") or ""
    title_chapter = (body.get("title_chapter") or "")[0:40]
    prompt = body.get("prompt") or ""
    is_final = bool(body.get("is_final", False))
    image_url = body.get("image_url") or None
    thumbnail_url = body.get("thumbnail_url") or None
    character_ids = body.get("character_ids") or []
    character_images = body.get("character_images") or []
    # Strip any existing SAS from incoming URLs to persist raw
    if isinstance(image_url, str):
        image_url = image_url.split('?', 1)[0]
    if isinstance(thumbnail_url, str):
        thumbnail_url = thumbnail_url.split('?', 1)[0]

    try:
        with SessionLocal() as session:
            story = session.get(Story, int(story_id))
            if not story or story.user_id != user_id:
                return jsonify({"error": "not_found"}), 404

            u = session.get(User, user_id)
            # Require configured credits for a chapter (text+image lifecycle)
            try:
                required = int(os.environ.get("CREDITS_CHAPTER", "2"))
            except Exception:
                required = 2
            if not u or (u.credits or 0) < required:
                return jsonify({"error": "insufficient_credits"}), 402

            next_idx = (session.query(DBChapter)
                         .filter(DBChapter.story_id == story.id)
                         .count()) + 1

            ch = DBChapter(
                story_id=story.id,
                index_in_story=next_idx,
                title=title_chapter or (prompt[:40] if prompt else f"Chapter {next_idx}"),
                text=text,
                image_url=image_url,
                audio_url=None,
                user_prompt=prompt,
                is_final=is_final
            )
            session.add(ch); session.flush()

            if thumbnail_url and getattr(ch, 'index_in_story', None) == 1:
                story.cover_image_url = thumbnail_url
            try:
                import json
                if isinstance(character_ids, list):
                    ids = []
                    for cid in character_ids:
                        try:
                            ids.append(int(cid))
                        except Exception:
                            continue
                    story.character_ids_json = json.dumps(ids) if ids else None
                if isinstance(character_images, list):
                    imgs = [i for i in character_images if isinstance(i, str)]
                    story.character_images_json = json.dumps(imgs) if imgs else None
            except Exception:
                pass
            if is_final:
                story.status = "finished"

            u.credits = max(0, (u.credits or 0) - required)
            session.commit()

            return jsonify({"chapter_id": ch.id}), 200
    except Exception as e:
        return jsonify({"error": "commit_chapter_failed", "detail": str(e)}), 500

# ---- Commit edited chapter: update text+image for an existing chapter ----
@app.post("/ai/commit-edited-chapter")
@require_auth
def ai_commit_edited_chapter():
    body = request.json or {}
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return jsonify({"error": "unauthorized"}), 401

    chapter_id_in = body.get("chapter_id")
    if not chapter_id_in:
        return jsonify({"error": "chapter_id_required"}), 400

    text = body.get("text") or ""
    title_chapter = (body.get("title_chapter") or "")[0:40]
    prompt = body.get("prompt") or ""
    is_final = bool(body.get("is_final", False))
    image_url = body.get("image_url") or None
    thumbnail_url = body.get("thumbnail_url") or None
    character_ids = body.get("character_ids") or []
    character_images = body.get("character_images") or []
    if isinstance(image_url, str):
        image_url = image_url.split('?', 1)[0]
    if isinstance(thumbnail_url, str):
        thumbnail_url = thumbnail_url.split('?', 1)[0]

    try:
        with SessionLocal() as session:
            ch = session.get(DBChapter, int(chapter_id_in))
            if not ch:
                return jsonify({"error": "chapter_not_found"}), 404
            story = session.get(Story, ch.story_id)
            if not story or story.user_id != user_id:
                return jsonify({"error": "not_found"}), 404

            u = session.get(User, user_id)
            try:
                chapter_cost = int(os.environ.get("CREDITS_CHAPTER", "2"))
            except Exception:
                chapter_cost = 2
            required = chapter_cost if image_url else max(1, chapter_cost)  # unified cost per chapter action
            if not u or (u.credits or 0) < required:
                return jsonify({"error": "insufficient_credits"}), 402

            # Update fields
            ch.title = title_chapter or ch.title
            ch.text = text if text is not None else ch.text
            if image_url:
                ch.image_url = image_url
            ch.user_prompt = prompt or ch.user_prompt
            if isinstance(is_final, bool):
                ch.is_final = is_final

            # Update story cover only for chapter 1 if new thumbnail provided
            if thumbnail_url and getattr(ch, 'index_in_story', None) == 1:
                story.cover_image_url = thumbnail_url

            # Update story-level characters if provided
            try:
                import json
                if isinstance(character_ids, list):
                    ids = []
                    for cid in character_ids:
                        try:
                            ids.append(int(cid))
                        except Exception:
                            continue
                    if ids:
                        story.character_ids_json = json.dumps(ids)
                if isinstance(character_images, list):
                    imgs = [i for i in character_images if isinstance(i, str)]
                    if imgs:
                        story.character_images_json = json.dumps(imgs)
            except Exception:
                pass

            # Deduct credits
            u.credits = max(0, (u.credits or 0) - required)
            session.commit()

            return jsonify({"chapter_id": ch.id}), 200
    except Exception as e:
        return jsonify({"error": "commit_edited_chapter_failed", "detail": str(e)}), 500

# ---- Commit seed: persist text+image and deduct credits in one go ----
@app.post("/ai/commit-seed")
@require_auth
def ai_commit_seed():
    body = request.json or {}
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return jsonify({"error": "unauthorized"}), 401

    text = body.get("text") or ""
    title_story = (body.get("title_story") or (body.get("prompt") or "Untitled"))[:40]
    title_chapter = (body.get("title_chapter") or (body.get("prompt") or "Chapter 1"))[:40]
    language = body.get("language") or None
    prompt = body.get("prompt") or ""
    image_url = body.get("image_url") or None
    thumbnail_url = body.get("thumbnail_url") or None
    # Strip any existing SAS from incoming URLs to persist raw
    if isinstance(image_url, str):
        image_url = image_url.split('?', 1)[0]
    if isinstance(thumbnail_url, str):
        thumbnail_url = thumbnail_url.split('?', 1)[0]
    character_ids = body.get("character_ids") or []
    character_images = body.get("character_images") or []
    bible_json = body.get("bible_json") or None

    try:
        with SessionLocal() as session:
            u = session.get(User, user_id)
            # Require configured credits for a chapter seed
            try:
                required = int(os.environ.get("CREDITS_CHAPTER", "2"))
            except Exception:
                required = 2
            if not u or (u.credits or 0) < required:
                return jsonify({"error": "insufficient_credits"}), 402

            # Create story and chapter
            story = Story(user_id=user_id, title=title_story, status="in_progress", language=language)
            session.add(story); session.flush()

            ch = DBChapter(
                story_id=story.id,
                index_in_story=1,
                title=title_chapter,
                text=text,
                image_url=image_url,
                audio_url=None,
                user_prompt=prompt,
                is_final=False
            )
            session.add(ch); session.flush()

            # Persist character metadata and cover
            try:
                import json
                ids = []
                for cid in (character_ids or []):
                    try:
                        ids.append(int(cid))
                    except Exception:
                        continue
                if ids:
                    story.character_ids_json = json.dumps(ids)
                imgs = [i for i in (character_images or []) if isinstance(i, str)]
                if imgs:
                    story.character_images_json = json.dumps(imgs)
                if thumbnail_url:
                    story.cover_image_url = thumbnail_url
                if bible_json:
                    try:
                        story.bible_json = json.dumps(bible_json) if not isinstance(bible_json, str) else bible_json
                    except Exception:
                        pass
            except Exception:
                pass

            # Skip audio generation here; handled on-demand in ebook viewer

            # Deduct credits
            u.credits = max(0, (u.credits or 0) - required)
            session.commit()

            return jsonify({
                "story_id": story.id,
                "chapter_id": ch.id,
                "cover_image_url": getattr(story, 'cover_image_url', None)
            }), 200
    except Exception as e:
        return jsonify({"error": "commit_failed", "detail": str(e)}), 500

# ---- Character Image Generation (stateless) ----
@app.post("/ai/generate-character")
@require_auth
def ai_generate_character():
    """Generate a character image from one input image and a prompt.

    Body JSON: { "prompt": string, "image": string(URL or data URL) }
    Returns: { "imageUrl": signedUrl }
    No DB persistence/retrieval. The generated image is uploaded to blob storage.
    """
    body = request.json or {}
    #prompt = body.get("prompt") or "Generate a friendly, kid-safe character image."
    prompt = PROMPT_CREATE_CHARACTER
    image_data_url = body.get("image") or None

    logging.info(f"GENERATING CHARACTER: {prompt} and image: {image_data_url}")

    # Check credits BEFORE invoking LLM
    user_id = getattr(g, 'user_id', None)
    if not user_id:
        return jsonify({"error": "unauthorized"}), 401
    with SessionLocal() as session:
        u = session.get(User, user_id)
        try:
            image_cost = int(os.environ.get("CREDITS_IMAGE", "1"))
        except Exception:
            image_cost = 1
        if not u or (u.credits or 0) < image_cost:
            return jsonify({"error": "insufficient_credits"}), 402

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "missing_gemini_api_key"}), 400

    if genai is None:
        return jsonify({"error": "google_genai_not_installed"}), 500

    # Helper: accept either data URL (base64) or http(s) URL -> (mime, bytes)
    def decode_image_ref(ref: str):
        try:
            if ref and isinstance(ref, str):
                if ref.startswith("data:") and ";base64," in ref:
                    header, b64 = ref.split(",", 1)
                    mime = header.split(":", 1)[1].split(";", 1)[0]
                    return mime, base64.b64decode(b64)
                if ref.startswith("http://") or ref.startswith("https://"):
                    try:
                        blob_bytes, blob_mime = download_blob_bytes_from_url(ref)
                        if blob_bytes:
                            return blob_mime or "image/png", blob_bytes
                    except Exception:
                        pass
                    try:
                        public_ref = make_public_url(ref)
                        r = requests.get(public_ref, timeout=12, headers={
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
                            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                            "Accept-Language": "en-US,en;q=0.9"
                        })
                        if r.status_code == 200 and r.content:
                            mime = r.headers.get("Content-Type") or mimetypes.guess_type(public_ref)[0] or "image/png"
                            return mime, r.content
                    except Exception:
                        return None, None
        except Exception:
            pass
        return None, None

    try:
        mime, blob = decode_image_ref(image_data_url) if image_data_url else (None, None)
        if not blob:
            return jsonify({"error": "missing_image"}), 400

        client = genai.Client(api_key=api_key)
        model = "gemini-2.5-flash-image-preview"

        # Enforce white background for character output
        full_prompt = f"{prompt} Use a white background."
        parts = [genai_types.Part.from_text(text=full_prompt)]
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

        # Upload generated image to Azure Blob and return a signed URL
        try:
            orig_url_raw, thumb_url_raw = upload_image_and_thumbnail(
                out_data,
                out_mime or "image/png",
                prefix=f"users/{user_id}/characters",
                thumb_width=300,
            )
            image_url = sign_blob_url(orig_url_raw)
        except Exception as e:
            # Fallback to data URL if upload fails
            base64_data = base64.b64encode(out_data).decode("utf-8")
            image_url = f"data:{out_mime};base64,{base64_data}"
            print(f"Character upload failed, returning data URL fallback: {e}")

        logging.info(f"GENERATED CHARACTER URL: {image_url}")
        # Decrement credits after successful generation
        try:
            with SessionLocal() as session:
                u = session.get(User, user_id)
                if u:
                    try:
                        image_cost = int(os.environ.get("CREDITS_IMAGE", "1"))
                    except Exception:
                        image_cost = 1
                    u.credits = max(0, (u.credits or 0) - image_cost)
                    session.commit()
        except Exception as e:
            print(f"Failed to decrement credits: {e}")
        
        return jsonify({"imageUrl": image_url}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---- Character Image Generation from Text (stateless) ----
@app.post("/ai/generate-character-from-text")
@require_auth
def ai_generate_character_from_text():
    """Generate a character image from text description only.

    Body JSON: { "prompt": string }
    Returns: { "imageUrl": signedUrl }
    No DB persistence/retrieval. The generated image is uploaded to blob storage.
    """
    body = request.json or {}
    prompt = body.get("prompt") or "Create a friendly, kid-safe character image."
    # Add white background instruction to the prompt
    prompt = f"{prompt} Use a white background. Do not add any object, just generate the portrait of the character."

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

        # Upload generated image to Azure Blob and return a signed URL
        try:
            orig_url_raw, thumb_url_raw = upload_image_and_thumbnail(
                out_data,
                out_mime or "image/png",
                prefix=f"users/{user_id}/characters",
                thumb_width=300,
            )
            image_url = sign_blob_url(orig_url_raw)
        except Exception as e:
            # Fallback to data URL if upload fails
            base64_data = base64.b64encode(out_data).decode("utf-8")
            image_url = f"data:{out_mime};base64,{base64_data}"
            print(f"Character (from text) upload failed, returning data URL fallback: {e}")

        # Decrement credits after successful generation
        try:
            with SessionLocal() as session:
                u = session.get(User, user_id)
                if u:
                    u.credits = max(0, (u.credits or 0) - 1)
                    session.commit()
        except Exception as e:
            print(f"Failed to decrement credits: {e}")
        
        return jsonify({"imageUrl": image_url}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---- Temp image upload (stateless) ----
@app.post("/uploads/temp-image")
@require_auth
def upload_temp_image():
    """Upload a temporary image to blob storage and return a signed URL.

    Body JSON: { "image": string(URL or data URL) }
    Returns: { "url": signedUrl }
    No DB persistence; intended for using the URL as reference in AI endpoints.
    """
    body = request.get_json(silent=True) or {}
    image_ref = body.get("image")
    if not image_ref or not isinstance(image_ref, str):
        return jsonify({"error": "missing_image"}), 400

    try:
        # Try data URL first
        mime, blob = parse_data_url(image_ref)
        data = None
        ctype = None
        if blob:
            data = blob
            ctype = mime or "image/png"
        else:
            # Try to fetch from our storage (no egress)
            data, ctype = download_blob_bytes_from_url(image_ref)
            if not data:
                # Fallback to public HTTP GET
                try:
                    public_ref = make_public_url(image_ref)
                    r = requests.get(public_ref, timeout=12, headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
                        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
                        "Accept-Language": "en-US,en;q=0.9"
                    })
                    if r.status_code == 200 and r.content:
                        data = r.content
                        ctype = r.headers.get("Content-Type") or "image/png"
                except Exception:
                    pass
        if not data:
            return jsonify({"error": "invalid_image"}), 400

        # Upload original only (no thumbnail) under temp namespace
        from storage_utils import _guess_ext_from_mime  # local helper
        ext = _guess_ext_from_mime(ctype or "image/png")
        raw_url = upload_bytes(data, ctype or "image/png", prefix=f"users/{g.user_id}/temp", extension=ext)
        signed = sign_blob_url(raw_url)
        return jsonify({"url": signed}), 201
    except Exception as e:
        return jsonify({"error": "upload_failed", "detail": str(e)}), 500

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
        # Accept either data URL or http(s) URL
        mime, blob = parse_data_url(image)
        if not blob:
            # Try downloading from storage/URL
            data, ctype = download_blob_bytes_from_url(image)
            if not data:
                # Fallback to public HTTP GET
                try:
                    public_ref = make_public_url(image)
                    r = requests.get(public_ref, timeout=12)
                    if r.status_code == 200 and r.content:
                        data = r.content
                        ctype = r.headers.get("Content-Type") or "image/png"
                except Exception:
                    pass
            if not data:
                return jsonify({"error": "invalid_image"}), 400
            orig_url, thumb_url = upload_image_and_thumbnail(data, ctype or "image/png", prefix=f"users/{g.user_id}/characters", thumb_width=300)
        else:
            # Data URL path
            orig_url, thumb_url = upload_image_and_thumbnail(blob, mime or "image/png", prefix=f"users/{g.user_id}/characters", thumb_width=300)
        with SessionLocal() as session:
            rec = CharacterImage(user_id=g.user_id, image_data=orig_url, name=name)
            session.add(rec)
            session.commit()
            return jsonify({"id": rec.id, "image": orig_url, "name": rec.name}), 201
    except Exception as e:
        return jsonify({"error": "save_failed", "detail": str(e)}), 500

@app.patch("/characters/<int:character_id>")
@require_auth
def update_character(character_id: int):
    body = request.get_json(silent=True) or {}
    name = body.get("name")
    image = body.get("image")  # optional
    try:
        with SessionLocal() as session:
            character = session.query(CharacterImage).filter(
                CharacterImage.id == character_id,
                CharacterImage.user_id == g.user_id
            ).first()
            if not character:
                return jsonify({"error": "character_not_found"}), 404

            if isinstance(name, str):
                character.name = name.strip() or None

            if isinstance(image, str) and image.strip():
                # Accept data URL or URL
                mime, blob = parse_data_url(image)
                if not blob:
                    data, ctype = download_blob_bytes_from_url(image)
                    if not data:
                        try:
                            public_ref = make_public_url(image)
                            r = requests.get(public_ref, timeout=12)
                            if r.status_code == 200 and r.content:
                                data = r.content
                                ctype = r.headers.get("Content-Type") or "image/png"
                        except Exception:
                            pass
                    if data:
                        url, _thumb = upload_image_and_thumbnail(data, ctype or "image/png", prefix=f"users/{g.user_id}/characters", thumb_width=300)
                        character.image_data = url
                else:
                    url, _thumb = upload_image_and_thumbnail(blob, mime or "image/png", prefix=f"users/{g.user_id}/characters", thumb_width=300)
                    character.image_data = url

            session.commit()
            return jsonify({"id": character.id, "image": character.image_data, "name": character.name}), 200
    except Exception as e:
        return jsonify({"error": "update_failed", "detail": str(e)}), 500

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
                "cover_image_url": sign_blob_url(getattr(s, "cover_image_url", None)) if getattr(s, "cover_image_url", None) else None,
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
                "image_url": sign_blob_url(ch.image_url) if ch.image_url else None,
                "audio_url": sign_blob_url(ch.audio_url) if ch.audio_url else None,
                "user_prompt": ch.user_prompt,
                "is_final": ch.is_final,
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
        # Parse story-level characters to return to client
        char_ids = []
        char_imgs = []
        try:
            import json
            if getattr(story, 'character_ids_json', None):
                parsed = json.loads(story.character_ids_json)
                if isinstance(parsed, list):
                    char_ids = [int(x) for x in parsed if str(x).isdigit()]
            if getattr(story, 'character_images_json', None):
                parsed_imgs = json.loads(story.character_images_json)
                if isinstance(parsed_imgs, list):
                    char_imgs = [str(x) for x in parsed_imgs if isinstance(x, str)]
        except Exception:
            pass
        return jsonify({
            "id": story.id,
            "title": story.title,
            "status": story.status,
            "chapters_count": count,
            "created_at": story.created_at.isoformat() if story.created_at else None,
            "cover_image_url": sign_blob_url(getattr(story, "cover_image_url", None)) if getattr(story, "cover_image_url", None) else None,
            "character_ids": char_ids,
            "character_images": char_imgs,
        })

@app.get("/stories/<int:story_id>/public")
def get_public_story(story_id: int):
    """Get a story for public sharing (no authentication required)"""
    with SessionLocal() as session:
        story = session.get(Story, story_id)
        if not story:
            return jsonify({"error": "not_found"}), 404
        
        # Get all chapters for this story
        chapters = session.query(DBChapter).filter(DBChapter.story_id == story_id).order_by(DBChapter.index_in_story).all()
        
        return jsonify({
            "id": story.id,
            "title": story.title,
            "language": getattr(story, "language", None),
            "chapters": [
                {
                    "id": ch.id,
                    "title": ch.title,
                    "text": ch.text,
                    "imageUrl": sign_blob_url(ch.image_url) if ch.image_url else None,
                    "audioUrl": sign_blob_url(ch.audio_url) if ch.audio_url else None,
                    "index": ch.index_in_story
                }
                for ch in chapters
            ]
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

# ElevenLabs endpoint
@app.route('/api/elevenlabs/speech', methods=['POST'])
def generate_elevenlabs_speech():
    """Generate speech using ElevenLabs with environment variables"""
    try:
        data = request.get_json()
        text = data.get('text')
        
        if not text:
            return jsonify({"error": "Text is required"}), 400
        
        # Get API key and voice ID from environment variables
        api_key = os.getenv('ELEVENLABS_API_KEY')
        voice_id = os.getenv('ELEVENLABS_VOICE_ID')
        
        if not api_key or not voice_id:
            return jsonify({
                "error": "ElevenLabs configuration not found. Please set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID environment variables."
            }), 500
        
        headers = {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': api_key
        }
        
        body = {
            'text': text,
            'model_id': 'eleven_multilingual_v2',
            'voice_settings': {
                'stability': 0.5,
                'similarity_boost': 0.5,
                'style': 0.0,
                'use_speaker_boost': True
            }
        }
        
        response = requests.post(f'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}', 
                               headers=headers, json=body)
        
        if response.status_code == 200:
            # Upload to blob and return URL
            try:
                url = upload_bytes(response.content, "audio/mpeg", prefix=f"users/{'anon'}/audio", extension="mp3")
                return jsonify({"audioUrl": url}), 200
            except Exception as e:
                return jsonify({"error": f"upload_failed: {str(e)}"}), 500
        else:
            return jsonify({"error": "Failed to generate speech", "status": response.status_code}), 400
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---- Get Chapter Audio Endpoint ----
@app.get("/api/chapters/<int:chapter_id>/audio")
@require_auth
def get_chapter_audio(chapter_id):
    """Get audio URL for a specific chapter"""
    try:
        with SessionLocal() as session:
            chapter = session.get(DBChapter, chapter_id)
            if not chapter:
                return jsonify({"error": "Chapter not found"}), 404
            
            # Check if user owns this chapter's story
            story = session.get(Story, chapter.story_id)
            if not story or story.user_id != g.user_id:
                return jsonify({"error": "Unauthorized"}), 403
            
            return jsonify({
                "chapter_id": chapter_id,
                "audio_url": chapter.audio_url,
                "has_audio": bool(chapter.audio_url)
            }), 200
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---- Generate Chapter Audio On-Demand ----
@app.post("/api/chapters/<int:chapter_id>/audio/generate")
@require_auth
def generate_chapter_audio_on_demand(chapter_id: int):
    """Generate audio for a chapter only when requested (lazy). If audio exists, return it.

    Returns: { chapter_id, audio_url }
    """
    try:
        with SessionLocal() as session:
            chapter = session.get(DBChapter, chapter_id)
            if not chapter:
                return jsonify({"error": "chapter_not_found"}), 404

            story = session.get(Story, chapter.story_id)
            if not story or story.user_id != g.user_id:
                return jsonify({"error": "unauthorized"}), 403

            # If already present, return immediately
            if chapter.audio_url:
                return jsonify({"chapter_id": chapter_id, "audio_url": chapter.audio_url}), 200

            # Guard: audio disabled
            if not AUDIO_ENABLED:
                return jsonify({"error": "audio_disabled"}), 400

            # Check credits BEFORE generating
            u = session.get(User, g.user_id)
            try:
                audio_cost = int(os.environ.get("CREDITS_AUDIO", "1"))
            except Exception:
                audio_cost = 1
            if not u or (u.credits or 0) < audio_cost:
                return jsonify({"error": "insufficient_credits"}), 402

            # Generate synchronously; front-end can show spinner
            text = chapter.text or ""
            if not text.strip():
                return jsonify({"error": "empty_text"}), 400

            audio_url = generate_audio_elevenlabs(text, story.language, g.user_id)
            if audio_url:
                chapter.audio_url = audio_url
                # Deduct configured credits per audio successfully generated
                try:
                    audio_cost = int(os.environ.get("CREDITS_AUDIO", "1"))
                except Exception:
                    audio_cost = 1
                u.credits = max(0, (u.credits or 0) - audio_cost)
                session.commit()
                return jsonify({"chapter_id": chapter_id, "audio_url": audio_url}), 200

            return jsonify({"error": "audio_generation_failed"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---- Generate Audio in Bulk for a Story ----
@app.post("/api/stories/<int:story_id>/audio/generate-all")
@require_auth
def generate_audio_for_story(story_id: int):
    """Generate audio for all chapters that don't have it yet.

    Deducts 1 credit per successfully generated chapter.
    Returns a list of {chapter_id, audio_url} generated.
    """
    if not AUDIO_ENABLED:
        return jsonify({"error": "audio_disabled"}), 400
    try:
        out = []
        with SessionLocal() as session:
            story = session.get(Story, story_id)
            if not story or story.user_id != g.user_id:
                return jsonify({"error": "not_found"}), 404

            u = session.get(User, g.user_id)
            if not u:
                return jsonify({"error": "unauthorized"}), 401

            chapters = (
                session.query(DBChapter)
                .filter(DBChapter.story_id == story.id)
                .order_by(DBChapter.index_in_story.asc())
                .all()
            )
            # Pre-check: must have at least CREDITS_AUDIO * chapters missing audio
            try:
                missing = [ch for ch in chapters if not getattr(ch, 'audio_url', None)]
                try:
                    audio_cost = int(os.environ.get("CREDITS_AUDIO", "1"))
                except Exception:
                    audio_cost = 1
                required_credits = len(missing) * max(1, audio_cost)
            except Exception:
                missing = []
                required_credits = 0
            available = int(u.credits or 0)
            if required_credits > 0 and available < required_credits:
                return jsonify({"error": "insufficient_credits", "required": required_credits, "available": available}), 402
            for ch in chapters:
                # Only generate for chapters missing audio
                if ch.audio_url:
                    continue
                text = (ch.text or "").strip()
                if not text:
                    continue
                url = generate_audio_elevenlabs(text, story.language, g.user_id)
                if url:
                    ch.audio_url = url
                    try:
                        audio_cost = int(os.environ.get("CREDITS_AUDIO", "1"))
                    except Exception:
                        audio_cost = 1
                    u.credits = max(0, (u.credits or 0) - max(1, audio_cost))
                    out.append({"chapter_id": ch.id, "audio_url": url})
            session.commit()
        return jsonify({"generated": out}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)



