from fastapi import FastAPI
from Backend.routes.fragrances import router as fragrance_router

app = FastAPI()

@app.get("/")
def home():
    return {"message": "Frag Friend API is running"}

app.include_router(fragrance_router)