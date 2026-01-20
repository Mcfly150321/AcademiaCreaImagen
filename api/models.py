from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Float
from sqlalchemy.orm import relationship
from .database import Base

class Student(Base):
    __tablename__ = "students"

    carnet = Column(String, primary_key=True, index=True)
    names = Column(String)
    lastnames = Column(String)
    age = Column(Integer)
    cui = Column(String, unique=True, index=True)
    phone = Column(String)
    is_adult = Column(Boolean)
    plan = Column(String) # diario, fin_de_semana, ejecutivo
    guardian1_name = Column(String, nullable=True)
    guardian1_phone = Column(String, nullable=True)
    guardian2_name = Column(String, nullable=True)
    guardian2_phone = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)
    registration_date = Column(String, nullable=True) # YYYY-MM

    payments = relationship("Payment", back_populates="student", cascade="all, delete-orphan")
    workshops = relationship("WorkshopStudent", back_populates="student", cascade="all, delete-orphan")

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, ForeignKey("students.carnet"))
    month = Column(Integer)
    year = Column(Integer)
    payment_type = Column(String, default="mensualidad") # mensualidad, inscripcion, gastos_varios
    is_paid = Column(Boolean, default=False)

    student = relationship("Student", back_populates="payments")

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)
    description = Column(String)
    cost = Column(Float)
    units = Column(Integer)
    alert_threshold = Column(Integer, default=5)

class Workshop(Base):
    __tablename__ = "workshops"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    description = Column(String)

    students = relationship("WorkshopStudent", back_populates="workshop", cascade="all, delete-orphan")
    packages = relationship("Package", back_populates="workshop", cascade="all, delete-orphan")

class WorkshopStudent(Base):
    __tablename__ = "workshop_students"

    id = Column(Integer, primary_key=True, index=True)
    workshop_id = Column(Integer, ForeignKey("workshops.id"))
    student_id = Column(String, ForeignKey("students.carnet"))
    package_paid = Column(Boolean, default=False)
    workshop_paid = Column(Boolean, default=False)
    package_id = Column(Integer, ForeignKey("packages.id"), nullable=True)

    workshop = relationship("Workshop", back_populates="students")
    student = relationship("Student", back_populates="workshops")
    package = relationship("Package")

class Package(Base):
    __tablename__ = "packages"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    description = Column(String)
    workshop_id = Column(Integer, ForeignKey("workshops.id"))

    workshop = relationship("Workshop", back_populates="packages")
    products = relationship("PackageProduct", back_populates="package", cascade="all, delete-orphan")

class PackageProduct(Base):
    __tablename__ = "package_products"

    id = Column(Integer, primary_key=True, index=True)
    package_id = Column(Integer, ForeignKey("packages.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    quantity = Column(Integer)

    package = relationship("Package", back_populates="products")
    product = relationship("Product")
