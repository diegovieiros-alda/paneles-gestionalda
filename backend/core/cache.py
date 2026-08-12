"""Cache corta para las consultas de solo lectura contra Odoo: evita repetir
la misma query cuando varios usuarios (o el mismo, al navegar) piden el
mismo rango de fechas en pocos minutos. Los datos de Odoo no son en tiempo
real para estos dashboards, así que un margen de minutos es aceptable.

ponytail: usa el backend de caché por defecto de Django (LocMemCache, en
memoria del proceso) — no compartida entre workers de gunicorn. Si el
número de workers crece y el hit-rate entre workers importa, pasar CACHES
a Redis/Memcached en settings.py; el decorador no cambia.
"""
from __future__ import annotations

import functools
import hashlib
import pickle

from django.core.cache import cache

TIMEOUT = 300  # 5 minutos


def cache_result(func):
    """Cachea el resultado de `func` por sus argumentos posicionales."""

    @functools.wraps(func)
    def wrapped(*args, **kwargs):
        raw = pickle.dumps((func.__module__, func.__qualname__, args, kwargs))
        key = "core:" + hashlib.sha1(raw).hexdigest()
        resultado = cache.get(key)
        if resultado is None:
            resultado = func(*args, **kwargs)
            cache.set(key, resultado, TIMEOUT)
        return resultado

    return wrapped
