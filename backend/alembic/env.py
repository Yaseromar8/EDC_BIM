"""
Entorno de Alembic. Construye la URL de la BD desde las MISMAS variables de
entorno que usa la app (db.py): DB_USER, DB_PASS, DB_HOST, DB_PORT, DB_NAME.
No usamos modelos SQLAlchemy: las migraciones son manuales (op.add_column, etc.).
"""
import os
import pathlib
from logging.config import fileConfig

from sqlalchemy import create_engine, URL, pool
from alembic import context
from dotenv import load_dotenv

# Cargar .env de la raíz del proyecto y, como respaldo, del CWD
load_dotenv(pathlib.Path(__file__).resolve().parent.parent.parent / ".env")
load_dotenv()

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None  # sin autogenerate; migraciones escritas a mano


def _db_url():
    return URL.create(
        "postgresql+psycopg2",
        username=os.getenv("DB_USER"),
        password=os.getenv("DB_PASS"),
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT", "5432"),
        database=os.getenv("DB_NAME"),
    )


def run_migrations_offline():
    context.configure(
        url=_db_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = create_engine(_db_url(), poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
