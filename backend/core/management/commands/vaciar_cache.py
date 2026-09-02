"""Vacía la caché de disco (django_cache/, ver core/cache.py) por completo.

Uso manual cuando se sabe que un dato de Odoo ya cacheado cambió y no se
quiere esperar a que expire por TTL (2 horas). No hay forma de invalidar
una única entrada (la clave es un hash de los argumentos de la función, no
algo legible/buscable) — vaciar todo es la única opción disponible hoy, y
es barata: la siguiente petición simplemente vuelve a consultar Odoo y
recachea (o espera a precalentar_cache, si corre antes).

Uso:
    python manage.py vaciar_cache
"""
from django.core.cache import cache
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Vacía por completo la caché de disco — la próxima petición de cada consulta volverá a Odoo."

    def handle(self, *args, **options):
        cache.clear()
        self.stdout.write(self.style.SUCCESS("Caché vaciada."))
