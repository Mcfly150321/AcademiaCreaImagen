from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Obtenemos la URL
SQLALCHEMY_DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URL")

# Importante: SQLAlchemy 1.4+ necesita que la URL empiece con postgresql://, no postgres://
if SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

if not SQLALCHEMY_DATABASE_URL:
    raise ValueError("La variable SQLALCHEMY_DATABASE_URL no está configurada en Vercel")

# pool_pre_ping ayuda a que no se caiga la conexión si Supabase entra en reposo
engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def init_db():
    # USAMOS EL PUNTO para evitar confusiones de nombres de carpeta
    from . import models 
    Base.metadata.create_all(bind=engine)