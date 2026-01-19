from datetime import datetime
from sqlalchemy.orm import Session
from . import models

def generate_carnet(db: Session, plan: str):
    # Count students to generate a simple sequential ID
    count = db.query(models.Student).count() + 1
    year = datetime.datetime.now().year
    suffix = "00"
    if plan == "diario":
        suffix = "10"
    elif plan == "fin_de_semana":
        suffix = "11"
    elif plan == "ejecutivo":
        suffix = "12"
    
    return f"{year}{count:04d}{suffix}"