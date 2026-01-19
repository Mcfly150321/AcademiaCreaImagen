from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# 1. Obtenemos la URL de la variable de entorno de Vercel
SQLALCHEMY_DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URL")

# 2. Creamos el motor SIN el connect_args (ya que es para Postgres)
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# 3. Configuramos la sesión
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 4. Definimos la base para los modelos
Base = declarative_base()

def init_db():
    # Esto creará las tablas en Supabase automáticamente
    from . import models  # Asegúrate de que la ruta sea correcta
    Base.metadata.create_all(bind=engine)