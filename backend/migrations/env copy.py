import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# 1) Cargar variables de entorno (.env)
from dotenv import load_dotenv
load_dotenv()

# 2) Importar metadata del proyecto
from db import engine
from models import Base

# Alembic Config object (acceso a alembic.ini)
config = context.config

# 3) Configuración de logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 4) Metadata de nuestros modelos para autogenerate
target_metadata = Base.metadata

# ====================================================
# Funciones de migración
# ====================================================

def run_migrations_offline():
    """Ejecuta migraciones en modo 'offline' (solo genera SQL)."""
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL no está definido en .env")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    """Ejecuta migraciones en modo 'online' (conectado a la DB)."""
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL no está definido en .env")

    connectable = engine_from_config(
        {"sqlalchemy.url": url},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool
    )
    
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


# Punto de entrada que elige online/offline
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
