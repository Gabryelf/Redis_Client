from fastapi import FastAPI, Request, Form, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from pathlib import Path
import sys
import os

# Добавляем корневую директорию проекта в PYTHONPATH
sys.path.append(str(Path(__file__).parent))

# Импортируем ПОСЛЕ добавления пути
try:
    from redis_client import redis_manager
except ImportError as e:
    print(f"Ошибка импорта redis_manager: {e}")
    print("Текущий PYTHONPATH:", sys.path)
    raise

app = FastAPI(
    title="Redis Manager Pro",
    description="Professional Redis Database Management Interface",
    version="2.0.0"
)

# Используем абсолютные пути
BASE_DIR = Path(__file__).parent
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")

# Проверяем подключение при старте
print("Проверяем подключение к Redis...")
connected = redis_manager.connect()
if connected:
    print("✓ Подключение к Redis установлено")
else:
    print("✗ Не удалось подключиться к Redis")


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """Главная страница"""
    try:
        # Проверяем подключение
        connected = redis_manager.connect() if not redis_manager.client else True

        # Получаем статистику
        stats = redis_manager.get_stats()

        # Получаем ключи только если подключение активно
        keys = []
        if stats.get('connected'):
            keys = redis_manager.get_all_keys()

            # Убедимся, что у всех ключей есть поле size
            for key in keys:
                if 'size' not in key:
                    key['size'] = 0

        return templates.TemplateResponse("index.html", {
            "request": request,
            "keys": keys,
            "stats": stats,
            "connected": stats.get('connected', False)
        })

    except Exception as e:
        print(f"Ошибка в read_root: {e}")
        import traceback
        traceback.print_exc()

        return templates.TemplateResponse("index.html", {
            "request": request,
            "keys": [],
            "stats": {"connected": False},
            "connected": False
        })


@app.post("/set/")
async def set_key(
        request: Request,
        key: str = Form(...),
        value_type: str = Form("string"),
        value: str = Form(...),
        ttl: int = Form(-1)
):
    """Добавить или обновить ключ"""
    try:
        success = redis_manager.set_value(key, value_type, value, ttl)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to set value")

        return RedirectResponse(url="/", status_code=303)
    except Exception as e:
        print(f"Ошибка в set_key: {e}")
        return RedirectResponse(
            url=f"/?error={str(e)}",
            status_code=303
        )


@app.post("/delete/{key}")
async def delete_key(key: str):
    """Удалить ключ"""
    try:
        success = redis_manager.delete_key(key)
        if not success:
            raise HTTPException(status_code=404, detail="Key not found")

        return RedirectResponse(url="/", status_code=303)
    except Exception as e:
        print(f"Ошибка в delete_key: {e}")
        return RedirectResponse(
            url=f"/?error={str(e)}",
            status_code=303
        )


@app.get("/key/{key}")
async def get_key_details(key: str):
    """Получить детали ключа"""
    try:
        details = redis_manager.get_key_details(key)
        if not details:
            raise HTTPException(status_code=404, detail="Key not found")

        return JSONResponse(content=details)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/flush/")
async def flush_database():
    """Очистить базу данных"""
    try:
        success = redis_manager.flush_database()
        if not success:
            raise HTTPException(status_code=500, detail="Failed to flush database")

        return RedirectResponse(url="/", status_code=303)
    except Exception as e:
        print(f"Ошибка в flush_database: {e}")
        return RedirectResponse(
            url=f"/?error={str(e)}",
            status_code=303
        )


@app.get("/api/stats")
async def get_stats():
    """API для получения статистики"""
    try:
        stats = redis_manager.get_stats()
        print(f"DEBUG API stats: {stats}")
        return JSONResponse(content=stats)
    except Exception as e:
        print(f"Ошибка в get_stats API: {e}")
        return JSONResponse(content={"connected": False, "error": str(e)})


@app.get("/api/search")
async def search_keys(pattern: str = Query("*")):
    """Поиск ключей"""
    try:
        keys = redis_manager.search_keys(pattern)
        print(f"DEBUG API search: pattern={pattern}, found={len(keys)}")
        return JSONResponse(content={"keys": keys})
    except Exception as e:
        print(f"Ошибка в search_keys API: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/test-connection")
async def test_connection():
    """Проверить соединение с Redis"""
    try:
        connected = redis_manager.connect()
        print(f"DEBUG test_connection: {connected}")
        return {"connected": connected}
    except Exception as e:
        print(f"Ошибка в test_connection: {e}")
        return {"connected": False, "error": str(e)}


@app.get("/api/debug-keys")
async def debug_keys():
    """Отладочный метод для проверки ключей"""
    try:
        keys = redis_manager.get_all_keys()
        return JSONResponse(content={
            "total_keys": len(keys),
            "keys": keys[:10] if keys else []  # Первые 10 ключей
        })
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)


if __name__ == "__main__":
    import uvicorn

    print(f"Запуск сервера на http://0.0.0.0:8000")
    print(f"Текущая директория: {os.getcwd()}")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
