import os
from dotenv import load_dotenv
from db import engine
from models import Base

if __name__ == "__main__":
    load_dotenv()
    Base.metadata.create_all(bind=engine)
    print("✅ Tablas creadas (si no existían).")
