from pydantic import BaseModel
from typing import List, Optional

class PaymentBase(BaseModel):
    month: int
    year: int
    payment_type: str = "mensualidad"
    is_paid: bool = False

class PaymentCreate(PaymentBase):
    student_id: str

class PaymentSchema(PaymentBase):
    id: int
    student_id: str

    class Config:
        from_attributes = True

class StudentBase(BaseModel):
    names: str
    lastnames: str
    age: int
    cui: str
    phone: str
    is_adult: bool
    plan: str
    guardian1_name: Optional[str] = None
    guardian1_phone: Optional[str] = None
    guardian2_name: Optional[str] = None
    guardian2_phone: Optional[str] = None
    photo_url: Optional[str] = None

class StudentCreate(StudentBase):
    pass

class StudentSchema(StudentBase):
    carnet: str
    registration_date: Optional[str] = None

    class Config:
        from_attributes = True

class ProductBase(BaseModel):
    code: str
    description: str
    cost: float
    units: int
    alert_threshold: int = 5

class ProductCreate(ProductBase):
    pass

class ProductSchema(ProductBase):
    id: int

    class Config:
        from_attributes = True

class WorkshopBase(BaseModel):
    name: str
    description: str

class WorkshopCreate(WorkshopBase):
    pass

class WorkshopSchema(WorkshopBase):
    id: int

    class Config:
        from_attributes = True

class PackageBase(BaseModel):
    name: str
    description: str
    workshop_id: int

class PackageCreate(PackageBase):
    pass

class PackageSchema(PackageBase):
    id: int

    class Config:
        from_attributes = True