from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from Backend.routes.fragrances import router as fragrance_router


app = FastAPI()

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "Frag Friend API is running"}


app.include_router(fragrance_router)