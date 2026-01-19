from datetime import datetime
from sqlalchemy.orm import Session
from . import models

def generate_carnet(db: Session, plan: str):
    year = datetime.now().year
    prefix = f"{year}"
    
    # Busca el carnet más alto del año actual
    max_carnet = db.query(models.Student.carnet).filter(
        models.Student.carnet.like(f"{prefix}%")
    ).order_by(models.Student.carnet.desc()).first()
    
    if max_carnet:
        # Extrae el número secuencial (asumiendo formato YYYYNNNNXX)
        # Tomamos los 4 dígitos después del año
        last_seq = int(max_carnet[0][4:8])
        new_seq = last_seq + 1
    else:
        new_seq = 1
        
    suffix = "00"
    if plan == "diario":
        suffix = "10"
    elif plan == "fin_de_semana":
        suffix = "11"
    elif plan == "ejecutivo":
        suffix = "12"
    
    return f"{year}{new_seq:04d}{suffix}"