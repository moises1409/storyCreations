import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# Cargar .env (útil en local, inofensivo en Azure/CI)
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# IMPORTA SOLO LA METADATA (sin crear engine)
from models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

def _resolve_db_url():
    # 1) Argumento -x db_url=...
    x = context.get_x_argument(as_dictionary=True)
    if "db_url" in x and x["db_url"]:
        return x["db_url"]

    # 2) Variable de entorno
    url = os.getenv("DATABASE_URL")
    if url:
        return url

    # 3) alembic.ini (si algún día lo pones ahí)
    ini_url = config.get_main_option("sqlalchemy.url")
    if ini_url:
        return ini_url

    raise RuntimeError("No se encontró URL de BD. Usa DATABASE_URL o -x db_url=...")

def run_migrations_offline():
    url = _resolve_db_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online():
    url = _resolve_db_url()
    connectable = engine_from_config(
        {"sqlalchemy.url": url},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
