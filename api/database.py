from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Agregamos una validación para que no explote si la variable no carga a tiempo
SQLALCHEMY_DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    # Esto evita el crash inmediato y te permite ver el error real en los logs
    raise ValueError("La variable SQLALCHEMY_DATABASE_URL no está configurada en Vercel")

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def init_db():
    # Usamos el nombre de la carpeta 'api' en lugar del punto para ser explícitos
    from api import models
    Base.metadata.create_all(bind=engine)