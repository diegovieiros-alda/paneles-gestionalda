"""Cache corta para las consultas de solo lectura contra Odoo: evita repetir
la misma query cuando varios usuarios (o el mismo, al navegar) piden el
mismo rango de fechas en pocos minutos. Los datos de Odoo no son en tiempo
real para estos dashboards, así que un margen de minutos es aceptable.

ponytail: CACHES apunta a FileBasedCache (ver settings.py) — un directorio
compartido en disco, para que los distintos workers de gunicorn vean la
misma cache. Si algún día hay varios servidores detrás de un balanceador,
pasar a Redis/Memcached en settings.py; el decorador no cambia.
"""
from __future__ import annotations

import contextlib
import contextvars
import functools
import hashlib
import pickle

from django.core.cache import cache

TIMEOUT = 300  # 5 minutos

# Cuenta hits/misses de cache_result durante una vista, para poder decirle
# al frontend si la respuesta vino de Odoo en vivo o de cache (ver
# views._sesion_json hermano `origen_datos` y el uso de `tracking()` en
# cada vista que llama a fetch_*). Un ContextVar porque las funciones
# cacheadas (bloqueos/hoteles repository) no reciben ni devuelven ningún
# objeto de request al que enganchar esto.
_tracker: contextvars.ContextVar["_Tracker | None"] = contextvars.ContextVar("cache_tracker", default=None)


class _Tracker:
    __slots__ = ("hits", "misses")

    def __init__(self):
        self.hits = 0
        self.misses = 0


@contextlib.contextmanager
def tracking():
    """Úsalo alrededor de las llamadas a fetch_* de una vista para saber si
    hubo alguna consulta real a Odoo (miss) o todo vino de cache (hits)."""
    tracker = _Tracker()
    token = _tracker.set(tracker)
    try:
        yield tracker
    finally:
        _tracker.reset(token)


def origen_datos(tracker: "_Tracker") -> str:
    return "odoo" if tracker.misses > 0 else "cache"


def cache_result(func):
    """Cachea el resultado de `func` por sus argumentos posicionales."""

    @functools.wraps(func)
    def wrapped(*args, **kwargs):
        raw = pickle.dumps((func.__module__, func.__qualname__, args, kwargs))
        key = "core:" + hashlib.sha1(raw).hexdigest()
        resultado = cache.get(key)
        tracker = _tracker.get()
        if resultado is None:
            resultado = func(*args, **kwargs)
            cache.set(key, resultado, TIMEOUT)
            if tracker is not None:
                tracker.misses += 1
        elif tracker is not None:
            tracker.hits += 1
        return resultado

    return wrapped
