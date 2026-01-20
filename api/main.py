from fastapi import FastAPI, Depends, HTTPException, Query, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional

# Cambia esto:
from . import database, schemas, models
from .database import SessionLocal, init_db
from .generatecarnet import generate_carnet

import datetime
import random

app = FastAPI()
router = APIRouter(prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Database
init_db()

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/students/", response_model=schemas.StudentSchema)
def create_student(student: schemas.StudentCreate, db: Session = Depends(get_db)):
    db_student = models.Student(**student.dict())
    db_student.carnet = generate_carnet(db, student.plan)
    db_student.registration_date = datetime.datetime.now().strftime("%Y-%m")
    db.add(db_student)
    db.commit()
    db.refresh(db_student)
    return db_student


@router.get("/students/", response_model=list[schemas.StudentSchema])
def read_students(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    students = db.query(models.Student).offset(skip).limit(limit).all()
    return students

@router.get("/students/{plan}", response_model=list[schemas.StudentSchema])
def read_students_by_plan(plan: str, db: Session = Depends(get_db)):
    if plan == "todos":
        return db.query(models.Student).all()
    return db.query(models.Student).filter(models.Student.plan == plan).all()

@router.delete("/students/{carnet}")
def delete_student(carnet: str, db: Session = Depends(get_db)):
    db_student = db.query(models.Student).filter(models.Student.carnet == carnet).first()
    if not db_student:
        raise HTTPException(status_code=404, detail="Student not found")
    db.delete(db_student)
    db.commit()
    return {"status": "success", "message": "Student deleted"}

# Payments
@router.get("/payments/{student_id}", response_model=list[schemas.PaymentSchema])
def get_payments(student_id: str, db: Session = Depends(get_db)):
    return db.query(models.Payment).filter(models.Payment.student_id == student_id).all()

@router.post("/payments/toggle/")
def toggle_payment(
    student_id: str = Query(...), 
    month: int = Query(...), 
    year: int = Query(...), 
    payment_type: str = Query("mensualidad"),
    db: Session = Depends(get_db)
):
    payment = db.query(models.Payment).filter(
        models.Payment.student_id == student_id,
        models.Payment.month == month,
        models.Payment.year == year,
        models.Payment.payment_type == payment_type
    ).first()

    if payment:
        # Si ya existe, lo borramos (Toggle OFF)
        db.delete(payment)
        status = "deleted"
        is_paid = False
    else:
        # Si no existe, lo creamos (Toggle ON)
        payment = models.Payment(
            student_id=student_id, 
            month=month, 
            year=year, 
            payment_type=payment_type,
            is_paid=True
        )
        db.add(payment)
        status = "created"
        is_paid = True
    
    db.commit()
    return {"status": status, "is_paid": is_paid}

# Inventory
@router.post("/products/", response_model=schemas.ProductSchema)
def create_product(product: schemas.ProductCreate, db: Session = Depends(get_db)):
    db_product = models.Product(**product.dict())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product

@router.get("/products/", response_model=list[schemas.ProductSchema])
def read_products(db: Session = Depends(get_db)):
    return db.query(models.Product).all()

@router.get("/products/{code}", response_model=schemas.ProductSchema)
def read_product_by_code(code: str, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.code == code).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

# Workshops
@router.post("/workshops/", response_model=schemas.WorkshopSchema)
def create_workshop(workshop: schemas.WorkshopBase, db: Session = Depends(get_db)):
    db_workshop = models.Workshop(**workshop.dict())
    db.add(db_workshop)
    db.commit()
    db.refresh(db_workshop)
    return db_workshop

@router.get("/workshops/", response_model=list[schemas.WorkshopSchema])
def read_workshops(db: Session = Depends(get_db)):
    return db.query(models.Workshop).all()

@router.get("/stats/")
def get_stats(db: Session = Depends(get_db)):
    students = db.query(models.Student).all()
    student_count = len(students)
    alert_count = db.query(models.Product).filter(models.Product.units <= models.Product.alert_threshold).count()
    
    total_pending = 0
    now = datetime.datetime.now()
    current_year = now.year
    current_month = now.month

    for s in students:
        if not s.registration_date:
            reg_year, reg_month = current_year, current_month
        else:
            try:
                reg_year, reg_month = map(int, s.registration_date.split("-"))
            except:
                reg_year, reg_month = current_year, current_month
        
        # 1. Mensualidades pendientes
        months_since_reg = (current_year - reg_year) * 12 + (current_month - reg_month) + 1
        paid_months = db.query(models.Payment).filter(
            models.Payment.student_id == s.carnet,
            models.Payment.payment_type == "mensualidad"
        ).count()
        
        total_pending += max(0, months_since_reg - paid_months)

        # 2. Pagos especiales pendientes (Inscripción y Gastos Varios)
        # Puedes agregar más aquí si lo deseas
        for ptype in ["inscripcion", "gastos_varios"]:
            exists = db.query(models.Payment).filter(
                models.Payment.student_id == s.carnet,
                models.Payment.payment_type == ptype
            ).first()
            if not exists:
                total_pending += 1
    
    return {
        "students": student_count,
        "alerts": alert_count,
        "pending_payments": total_pending,
        "server_year": current_year,
        "server_month": current_month
    }

@router.get("/inventory/alerts/")
def get_inventory_alerts(db: Session = Depends(get_db)):
    return db.query(models.Product).filter(models.Product.units <= models.Product.alert_threshold).all()

# Workshops and Packages
@router.delete("/workshops/{workshop_id}/students/{student_id}")
def remove_student_from_workshop(workshop_id: int, student_id: str, db: Session = Depends(get_db)):
    assoc = db.query(models.WorkshopStudent).filter(
        models.WorkshopStudent.workshop_id == workshop_id,
        models.WorkshopStudent.student_id == student_id
    ).first()
    if not assoc:
        raise HTTPException(status_code=404, detail="Student not found in workshop")
    db.delete(assoc)
    db.commit()
    return {"status": "success"}

@router.get("/workshops/{workshop_id}/students/", response_model=list[schemas.WorkshopStudentSchema])
def get_workshop_students(workshop_id: int, db: Session = Depends(get_db)):
    students = db.query(models.WorkshopStudent).filter(models.WorkshopStudent.workshop_id == workshop_id).all()
    result = []
    for s in students:
        student_data = db.query(models.Student).filter(models.Student.carnet == s.student_id).first()
        if student_data:
            result.append({
                "student_id": s.student_id,
                "names": student_data.names,
                "lastnames": student_data.lastnames,
                "package_paid": s.package_paid,
                "workshop_paid": s.workshop_paid,
                "package_id": s.package_id
            })
    return result

@router.post("/packages/{package_id}/products/")
def add_product_to_package(package_id: int, item: schemas.PackageProductCreate, db: Session = Depends(get_db)):
    db_item = models.PackageProduct(**item.dict(), package_id=package_id)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@router.delete("/packages/{package_id}/products/{product_id}")
def remove_product_from_package(package_id: int, product_id: int, db: Session = Depends(get_db)):
    item = db.query(models.PackageProduct).filter(
        models.PackageProduct.package_id == package_id,
        models.PackageProduct.product_id == product_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Product not found in package")
    db.delete(item)
    db.commit()
    return {"status": "success"}

@router.post("/workshops/{workshop_id}/packages/", response_model=schemas.PackageSchema)
def create_package(workshop_id: int, package: schemas.PackageCreate, db: Session = Depends(get_db)):
    db_package = models.Package(**package.dict())
    db_package.workshop_id = workshop_id
    db.add(db_package)
    db.commit()
    db.refresh(db_package)
    return db_package

@router.post("/workshops/{workshop_id}/generate-diplomas/")
def generate_diplomas(workshop_id: int, db: Session = Depends(get_db)):
    # Mocking Canva integration
    workshop = db.query(models.Workshop).get(workshop_id)
    students = db.query(models.WorkshopStudent).filter(models.WorkshopStudent.workshop_id == workshop_id).all()
    
    # In a real scenario, this would use a Canva API or a webhook
    return {
        "status": "success",
        "message": f"Generated {len(students)} diplomas for workshop: {workshop.name}",
        "canva_link": f"https://www.canva.com/design/mock-{random.randint(1000, 9999)}/view"
    }

@router.get("/workshops/{workshop_id}/packages/", response_model=list[schemas.PackageSchema])
def get_workshop_packages(workshop_id: int, db: Session = Depends(get_db)):
    return db.query(models.Package).filter(models.Package.workshop_id == workshop_id).all()

@router.put("/packages/{package_id}", response_model=schemas.PackageSchema)
def update_package(package_id: int, package_data: schemas.PackageCreate, db: Session = Depends(get_db)):
    db_package = db.query(models.Package).get(package_id)
    if not db_package:
        raise HTTPException(status_code=404, detail="Package not found")
    for key, value in package_data.dict().items():
        setattr(db_package, key, value)
    db.commit()
    db.refresh(db_package)
    return db_package

@router.delete("/packages/{package_id}")
def delete_package(package_id: int, db: Session = Depends(get_db)):
    db_package = db.query(models.Package).get(package_id)
    if not db_package:
        raise HTTPException(status_code=404, detail="Package not found")
    db.delete(db_package)
    db.commit()
    return {"status": "success"}

@router.post("/workshop-students/toggle/")
def toggle_workshop_payment(workshop_id: int, student_id: str, payment_type: str, db: Session = Depends(get_db)):
    # payment_type can be 'package' or 'workshop'
    assoc = db.query(models.WorkshopStudent).filter(
        models.WorkshopStudent.workshop_id == workshop_id,
        models.WorkshopStudent.student_id == student_id
    ).first()
    
    if not assoc:
        raise HTTPException(status_code=404, detail="Student not found in workshop")
    
    if payment_type == "package":
        assoc.package_paid = not assoc.package_paid
    elif payment_type == "workshop":
        assoc.workshop_paid = not assoc.workshop_paid
    elif payment_type == "package_id":
        # En este caso 'student_id' (que es un query param) no se usa para el id del pack,
        # pero podemos pasar el id del pack en otro parametro o reutilizar.
        # Mejor hagamos un endpoint separado para asignar paquete.
        pass
    
    db.commit()
    return {"status": "success", "package_paid": assoc.package_paid, "workshop_paid": assoc.workshop_paid}

@router.post("/workshop-students/assign-package/")
def assign_package_to_student(workshop_id: int, student_id: str, package_id: Optional[int] = None, db: Session = Depends(get_db)):
    assoc = db.query(models.WorkshopStudent).filter(
        models.WorkshopStudent.workshop_id == workshop_id,
        models.WorkshopStudent.student_id == student_id
    ).first()
    if not assoc:
        raise HTTPException(status_code=404, detail="Student not found in workshop")
    
    assoc.package_id = package_id
    db.commit()
    return {"status": "success"}

app.include_router(router)
