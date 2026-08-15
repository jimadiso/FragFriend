from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from Backend.routes.fragrances import router as fragrance_router
from Backend.routes.auth import router as auth_router
from Backend.routes.bookmarks import router as bookmark_router
from Backend.routes.collections import router as collection_router


app = FastAPI()

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "Frag Friend API is running"}


app.include_router(fragrance_router)
app.include_router(auth_router)
app.include_router(bookmark_router)
app.include_router(collection_router)