from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from backend import database, schemas, models
from backend.database import SessionLocal, init_db
from .generatecarnet import generate_carnet

# ESTO FALTABA:
import datetime
import random

app = FastAPI()

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


@app.post("/students/", response_model=schemas.StudentSchema)
def create_student(student: schemas.StudentCreate, db: Session = Depends(get_db)):
    db_student = models.Student(**student.dict())
    db_student.carnet = generate_carnet(db, student.plan)
    db_student.registration_date = datetime.datetime.now().strftime("%Y-%m")
    db.add(db_student)
    db.commit()
    db.refresh(db_student)
    return db_student


@app.get("/students/", response_model=list[schemas.StudentSchema])
def read_students(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    students = db.query(models.Student).offset(skip).limit(limit).all()
    return students

@app.get("/students/{plan}", response_model=list[schemas.StudentSchema])
def read_students_by_plan(plan: str, db: Session = Depends(get_db)):
    if plan == "todos":
        return db.query(models.Student).all()
    return db.query(models.Student).filter(models.Student.plan == plan).all()

# Payments
@app.get("/payments/{student_id}", response_model=list[schemas.PaymentSchema])
def get_payments(student_id: int, db: Session = Depends(get_db)):
    return db.query(models.Payment).filter(models.Payment.student_id == student_id).all()

@app.post("/payments/toggle/")
def toggle_payment(
    student_id: int = Query(...), 
    month: int = Query(...), 
    year: int = Query(...), 
    db: Session = Depends(get_db)
):
    payment = db.query(models.Payment).filter(
        models.Payment.student_id == student_id,
        models.Payment.month == month,
        models.Payment.year == year
    ).first()

    if payment:
        payment.is_paid = not payment.is_paid
    else:
        payment = models.Payment(student_id=student_id, month=month, year=year, is_paid=True)
        db.add(payment)
    
    db.commit()
    return {"status": "success", "is_paid": payment.is_paid}

# Inventory
@app.post("/products/", response_model=schemas.ProductSchema)
def create_product(product: schemas.ProductCreate, db: Session = Depends(get_db)):
    db_product = models.Product(**product.dict())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product

@app.get("/products/", response_model=list[schemas.ProductSchema])
def read_products(db: Session = Depends(get_db)):
    return db.query(models.Product).all()

@app.get("/products/{code}", response_model=schemas.ProductSchema)
def read_product_by_code(code: str, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.code == code).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product

# Workshops
@app.post("/workshops/", response_model=schemas.WorkshopSchema)
def create_workshop(workshop: schemas.WorkshopBase, db: Session = Depends(get_db)):
    db_workshop = models.Workshop(**workshop.dict())
    db.add(db_workshop)
    db.commit()
    db.refresh(db_workshop)
    return db_workshop

@app.get("/workshops/", response_model=list[schemas.WorkshopSchema])
def read_workshops(db: Session = Depends(get_db)):
    return db.query(models.Workshop).all()

@app.get("/stats/")
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
            # Si no tiene fecha, asumimos el mes actual para que al menos cuente si debe este mes
            reg_year, reg_month = current_year, current_month
        else:
            try:
                reg_year, reg_month = map(int, s.registration_date.split("-"))
            except:
                reg_year, reg_month = current_year, current_month
        
        # Calculate total months since registration
        months_since_reg = (current_year - reg_year) * 12 + (current_month - reg_month) + 1
        
        # Count paid months for this student
        paid_count = db.query(models.Payment).filter(
            models.Payment.student_id == s.id,
            models.Payment.is_paid == True
        ).count()
        
        total_pending += max(0, months_since_reg - paid_count)
    
    return {
        "students": student_count,
        "alerts": alert_count,
        "pending_payments": total_pending
    }

@app.get("/inventory/alerts/")
def get_inventory_alerts(db: Session = Depends(get_db)):
    return db.query(models.Product).filter(models.Product.units <= models.Product.alert_threshold).all()

# Workshops and Packages
@app.post("/workshops/{workshop_id}/students/{student_id}")
def add_student_to_workshop(workshop_id: int, student_id: int, db: Session = Depends(get_db)):
    assoc = models.WorkshopStudent(workshop_id=workshop_id, student_id=student_id)
    db.add(assoc)
    db.commit()
    return {"status": "success"}

@app.get("/workshops/{workshop_id}/students/", response_model=list)
def get_workshop_students(workshop_id: int, db: Session = Depends(get_db)):
    students = db.query(models.WorkshopStudent).filter(models.WorkshopStudent.workshop_id == workshop_id).all()
    result = []
    for s in students:
        # Cambio aquí:
        student_data = db.query(models.Student).filter(models.Student.id == s.student_id).first()
        if student_data:
            result.append({
                "student_id": s.student_id,
                "names": student_data.names,
                "lastnames": student_data.lastnames,
                "package_paid": s.package_paid,
                "workshop_paid": s.workshop_paid
            })
    return result

@app.post("/workshops/{workshop_id}/packages/", response_model=schemas.PackageSchema)
def create_package(workshop_id: int, package: schemas.PackageCreate, db: Session = Depends(get_db)):
    db_package = models.Package(**package.dict())
    db_package.workshop_id = workshop_id
    db.add(db_package)
    db.commit()
    db.refresh(db_package)
    return db_package

@app.post("/workshops/{workshop_id}/generate-diplomas/")
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

@app.get("/workshops/{workshop_id}/packages/", response_model=list[schemas.PackageSchema])
def get_workshop_packages(workshop_id: int, db: Session = Depends(get_db)):
    return db.query(models.Package).filter(models.Package.workshop_id == workshop_id).all()

@app.put("/packages/{package_id}", response_model=schemas.PackageSchema)
def update_package(package_id: int, package_data: schemas.PackageCreate, db: Session = Depends(get_db)):
    db_package = db.query(models.Package).get(package_id)
    if not db_package:
        raise HTTPException(status_code=404, detail="Package not found")
    for key, value in package_data.dict().items():
        setattr(db_package, key, value)
    db.commit()
    db.refresh(db_package)
    return db_package

@app.delete("/packages/{package_id}")
def delete_package(package_id: int, db: Session = Depends(get_db)):
    db_package = db.query(models.Package).get(package_id)
    if not db_package:
        raise HTTPException(status_code=404, detail="Package not found")
    db.delete(db_package)
    db.commit()
    return {"status": "success"}

@app.post("/workshop-students/toggle/")
def toggle_workshop_payment(workshop_id: int, student_id: int, payment_type: str, db: Session = Depends(get_db)):
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
    
    db.commit()
    return {"status": "success", "package_paid": assoc.package_paid, "workshop_paid": assoc.workshop_paid}
