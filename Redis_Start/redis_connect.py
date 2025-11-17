import redis

try:
    r = redis.Redis(host='localhost', port=6379, db=0)
    r.set('test', 'Hello Redis!')
    value = r.get('test')
    print(f"Redis работает! Значение: {value}")
except Exception as e:
    print(f"Ошибка: {e}")
