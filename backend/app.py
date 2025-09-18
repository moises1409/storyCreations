from flask import Flask, request, jsonify, g
from flask_cors import CORS
import os
from datetime import date
from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from db import SessionLocal
from models import User, Story, Chapter as DBChapter, Base, AccountDeletion, CreditAddition
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
from prompts import PROMPT_USER1, PROMPT_SYSTEM_SEED, PROMPT_SYSTEM_CHAPTER, PROMPT_SYSTEM_CHAPTER_FINAL

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
    return "esto es un test de contacto"

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
    topic = (request.json or {}).get("prompt") or (
        "a brave young fox in a moonlit enchanted forest"
    )
    
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

            completion = client.responses.parse(
                # model="gpt-4o-2024-08-06",
                model="gpt-5-nano",
                input=[
                    {"role": "system", "content": PROMPT_SYSTEM_SEED},
                    {"role": "user", "content": PROMPT_USER1 + topic}
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
                # Initialize cover as None for now
                story.cover_image_url = None
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
    story_id_from_client = body.get("story_id")
    chapter_id_from_client = body.get("chapter_id")

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return jsonify({"error": "missing_gemini_api_key"}), 400

    if genai is None:
        return jsonify({"error": "google_genai_not_installed"}), 500

    try:
        client = genai.Client(api_key=api_key)
        model = "gemini-2.5-flash-image-preview"
        contents = [
            genai_types.Content(
                role="user",
                parts=[genai_types.Part.from_text(text=prompt)],
            )
        ]
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
                    except Exception:
                        pass
                    session.commit()
        except Exception as e:
            print(f"Failed to persist image_url to DB: {e}")

        return jsonify({"imageUrl": data_url}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

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
        # Delete user's stories (chapters cascade via relationship)
        stories = session.query(Story).filter(Story.user_id == user.id).all()
        for s in stories:
            session.delete(s)
        session.delete(user)
        session.commit()
        return jsonify({"ok": True}), 200

if __name__ == "__main__":
    app.run(debug=True)



