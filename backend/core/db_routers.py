class OdooReadOnlyRouter:
    """Keeps Django migrations and ORM writes off the 'odoo' alias.

    That database is a third-party production PMS we only read from via raw
    SQL (see core/bloqueos/repository.py) — no Django models are defined for
    it, so there's nothing to migrate there.
    """

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        return db != 'odoo'
