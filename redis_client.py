import json
import redis
from typing import Any, Dict, List, Optional, Union
from config import settings


class RedisManager:
    def __init__(self):
        self.client = None
        self.connect()

    def connect(self) -> bool:
        """Установить соединение с Redis"""
        try:
            connection_params = {
                'host': settings.REDIS_HOST,
                'port': settings.REDIS_PORT,
                'db': settings.REDIS_DB,
                'decode_responses': True,  # ВСЕ значения автоматически декодируются в строки
                'socket_connect_timeout': 5,
                'socket_timeout': 5
            }

            if settings.REDIS_PASSWORD:
                connection_params['password'] = settings.REDIS_PASSWORD

            if settings.REDIS_SSL:
                connection_params['ssl'] = settings.REDIS_SSL

            self.client = redis.Redis(**connection_params)
            self.client.ping()
            return True
        except Exception as e:
            print(f"Redis connection error: {e}")
            self.client = None
            return False

    def get_all_keys(self, pattern: str = "*") -> List[Dict]:
        """Получить все ключи с их типами и значениями"""
        try:
            if not self.client:
                self.connect()
                if not self.client:
                    return []

            keys = self.client.keys(pattern)
            result = []

            for key in keys:
                try:
                    key_str = key  # Уже строка благодаря decode_responses=True

                    # Получаем тип ключа
                    try:
                        key_type = self.client.type(key)
                        if isinstance(key_type, bytes):
                            key_type = key_type.decode('utf-8', errors='ignore')
                        elif not isinstance(key_type, str):
                            key_type = str(key_type)
                    except Exception:
                        key_type = 'unknown'

                    # Получаем размер ключа
                    try:
                        size = self.client.memory_usage(key) or 0
                    except Exception:
                        size = 0

                    # Получаем TTL
                    try:
                        ttl = self.client.ttl(key)
                    except Exception:
                        ttl = -1

                    # Создаем базовый объект
                    item = {
                        'key': key_str,
                        'type': key_type,
                        'size': size,
                        'ttl': ttl,
                        'preview': '',
                        'value': None
                    }

                    # Получаем значение в зависимости от типа
                    try:
                        if key_type == 'string':
                            value = self.client.get(key)
                            item['value'] = value
                            item['preview'] = self._truncate_preview(value)

                        elif key_type == 'hash':
                            value = self.client.hgetall(key)
                            item['value'] = value
                            item['preview'] = f"Hash with {len(value)} fields"

                        elif key_type == 'list':
                            value = self.client.lrange(key, 0, 4)  # Первые 5 элементов
                            item['value'] = value
                            length = self.client.llen(key)
                            item['length'] = length
                            item['preview'] = f"List with {length} items"

                        elif key_type == 'set':
                            value = self.client.smembers(key)
                            item['value'] = list(value) if value else []
                            length = self.client.scard(key)
                            item['length'] = length
                            item['preview'] = f"Set with {length} members"

                        elif key_type == 'zset':
                            value = self.client.zrange(key, 0, 4, withscores=True)  # Первые 5 элементов
                            item['value'] = value
                            length = self.client.zcard(key)
                            item['length'] = length
                            item['preview'] = f"Sorted Set with {length} items"

                        elif key_type == 'stream':
                            value = self.client.xrange(key, count=5)
                            item['value'] = value
                            length = self.client.xlen(key)
                            item['length'] = length
                            item['preview'] = f"Stream with {length} messages"

                        else:
                            item['preview'] = f"Type: {key_type}"

                    except Exception as e:
                        item['preview'] = f"Error reading value: {str(e)[:50]}"

                    result.append(item)

                except Exception as e:
                    print(f"Error processing key {key}: {e}")
                    # Все равно добавляем ключ, но как ошибку
                    result.append({
                        'key': str(key)[:100] if key else 'unknown',
                        'type': 'error',
                        'size': 0,
                        'ttl': -1,
                        'preview': f"Error: {str(e)[:50]}",
                        'value': None
                    })

            return sorted(result, key=lambda x: x['key'])

        except Exception as e:
            print(f"Error getting keys: {e}")
            return []

    def _truncate_preview(self, value: Any, max_length: int = 100) -> str:
        """Создать краткое представление значения"""
        if value is None:
            return "NULL"

        if isinstance(value, (dict, list)):
            try:
                value_str = json.dumps(value, ensure_ascii=False)
            except:
                value_str = str(value)
        else:
            value_str = str(value)

        if len(value_str) > max_length:
            return value_str[:max_length] + "..."
        return value_str

    # Остальные методы можно оставить без изменений или упростить
    def set_value(self, key: str, value_type: str, value: Any, ttl: int = -1) -> bool:
        """Установить значение в Redis"""
        try:
            # Удаляем старый ключ
            self.client.delete(key)

            if value_type == 'string':
                if ttl > 0:
                    self.client.setex(key, ttl, str(value))
                else:
                    self.client.set(key, str(value))

            elif value_type == 'hash':
                if isinstance(value, str):
                    try:
                        value = json.loads(value)
                    except:
                        value = {"value": str(value)}

                self.client.hset(key, mapping=value)

            elif value_type == 'list':
                if isinstance(value, str):
                    try:
                        value = json.loads(value)
                    except:
                        value = [value]

                if value:
                    self.client.rpush(key, *value)

            elif value_type == 'set':
                if isinstance(value, str):
                    try:
                        value = json.loads(value)
                    except:
                        value = {value}

                if value:
                    self.client.sadd(key, *value)

            elif value_type == 'zset':
                if isinstance(value, str):
                    try:
                        value = json.loads(value)
                    except:
                        value = []

                # Для zset нужны пары (значение, счет)
                if value and isinstance(value, list):
                    for member in value:
                        self.client.zadd(key, {str(member): 1})

            if ttl > 0:
                self.client.expire(key, ttl)

            return True

        except Exception as e:
            print(f"Error setting value: {e}")
            return False

    def delete_key(self, key: str) -> bool:
        """Удалить ключ"""
        try:
            return bool(self.client.delete(key))
        except Exception as e:
            print(f"Error deleting key: {e}")
            return False

    def get_key_details(self, key: str) -> Optional[Dict]:
        """Получить детальную информацию о ключе"""
        try:
            if not self.client:
                return None

            key_type = self.client.type(key)
            if isinstance(key_type, bytes):
                key_type = key_type.decode('utf-8')

            details = {
                'key': key,
                'type': key_type,
                'ttl': self.client.ttl(key),
                'size': self.client.memory_usage(key) or 0,
            }

            if key_type == 'string':
                details['value'] = self.client.get(key)

            elif key_type == 'hash':
                details['value'] = self.client.hgetall(key)
                details['length'] = self.client.hlen(key)

            elif key_type == 'list':
                details['value'] = self.client.lrange(key, 0, -1)
                details['length'] = self.client.llen(key)

            elif key_type == 'set':
                details['value'] = list(self.client.smembers(key))
                details['length'] = self.client.scard(key)

            elif key_type == 'zset':
                details['value'] = self.client.zrange(key, 0, -1, withscores=True)
                details['length'] = self.client.zcard(key)

            elif key_type == 'stream':
                details['value'] = self.client.xrange(key)
                details['length'] = self.client.xlen(key)

            return details

        except Exception as e:
            print(f"Error getting key details: {e}")
            return None

    def get_stats(self) -> Dict:
        """Получить статистику Redis"""
        try:
            if not self.client:
                return {'connected': False}

            info = self.client.info()
            return {
                'connected': True,
                'keys_count': info.get('db0', {}).get('keys', 0),
                'used_memory': info.get('used_memory_human', 'N/A'),
                'connected_clients': info.get('connected_clients', 0),
                'uptime': info.get('uptime_in_seconds', 0),
                'ops_per_sec': info.get('instantaneous_ops_per_sec', 0),
                'hits': info.get('keyspace_hits', 0),
                'misses': info.get('keyspace_misses', 0)
            }
        except Exception as e:
            print(f"Error getting stats: {e}")
            return {'connected': False}

    def flush_database(self) -> bool:
        """Очистить базу данных"""
        try:
            self.client.flushdb()
            return True
        except Exception as e:
            print(f"Error flushing DB: {e}")
            return False

    def search_keys(self, pattern: str = "*") -> List[str]:
        """Поиск ключей по паттерну"""
        try:
            keys = self.client.keys(pattern)
            # Преобразуем все ключи в строки
            return [str(k) for k in keys]
        except Exception as e:
            print(f"Error searching keys: {e}")
            return []


# Создаем глобальный экземпляр
redis_manager = RedisManager()