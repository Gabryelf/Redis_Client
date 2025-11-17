from fastapi import FastAPI, Request, Form
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
import redis
import json

app = FastAPI(title="Redis Manager")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

redis_client = redis.Redis(
    host='localhost',
    port=6379,
    db=0,
    decode_responses=True,
    socket_connect_timeout=5
)


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    try:
        keys = redis_client.keys('*')
        key_values = []

        for key in keys:
            key_type = redis_client.type(key)
            if key_type == 'string':
                value = redis_client.get(key)
            elif key_type == 'hash':
                value = redis_client.hgetall(key)
            elif key_type == 'list':
                value = redis_client.lrange(key, 0, -1)
            else:
                value = "Unsupported type"

            key_values.append({
                'key': key,
                'type': key_type,
                'value': value,
                'ttl': redis_client.ttl(key)
            })

        return templates.TemplateResponse("index.html", {
            "request": request,
            "keys": key_values,
            "redis_status": "connected"
        })
    except Exception as e:
        return templates.TemplateResponse("index.html", {
            "request": request,
            "keys": [],
            "redis_status": f"error: {str(e)}"
        })


@app.post("/set/")
async def set_key(
        key: str = Form(...),
        value: str = Form(...),
        key_type: str = Form("string"),
        ttl: int = Form(-1)
):
    try:
        if key_type == "string":
            if ttl > 0:
                redis_client.setex(key, ttl, value)
            else:
                redis_client.set(key, value)
        elif key_type == "hash":
            try:
                dict_value = json.loads(value)
                redis_client.hset(key, mapping=dict_value)
            except json.JSONDecodeError:
                redis_client.hset(key, "value", value)

        return RedirectResponse(url="/", status_code=303)
    except Exception as e:
        return RedirectResponse(url=f"/?error={str(e)}", status_code=303)


@app.post("/delete/{key}")
async def delete_key(key: str):
    try:
        redis_client.delete(key)
        return RedirectResponse(url="/", status_code=303)
    except Exception as e:
        return RedirectResponse(url=f"/?error={str(e)}", status_code=303)


@app.get("/get/{key}")
async def get_key(key: str):
    try:
        key_type = redis_client.type(key)

        if key_type == 'string':
            value = redis_client.get(key)
        elif key_type == 'hash':
            value = redis_client.hgetall(key)
        elif key_type == 'list':
            value = redis_client.lrange(key, 0, -1)
        else:
            value = None

        return {
            "key": key,
            "type": key_type,
            "value": value,
            "ttl": redis_client.ttl(key)
        }
    except Exception as e:
        return {"error": str(e)}


@app.post("/flush/")
async def flush_database():
    try:
        redis_client.flushdb()
        return RedirectResponse(url="/", status_code=303)
    except Exception as e:
        return RedirectResponse(url=f"/?error={str(e)}", status_code=303)


@app.get("/api/stats")
async def get_stats():
    try:
        info = redis_client.info()
        return {
            "connected": True,
            "keys_count": len(redis_client.keys('*')),
            "used_memory": info.get('used_memory_human', 'N/A'),
            "connected_clients": info.get('connected_clients', 0)
        }
    except:
        return {"connected": False}

# https://github.com/microsoftarchive/redis/releases
# pip install fastapi uvicorn redis jinja2 python-multipart
# uvicorn main:app --reload --host localhost --port 8000
