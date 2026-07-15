# Paneles Gestionalda

Panel de gestión — React (Vite + TypeScript) + Django.

```
backend/   # Django (API en /api/, admin en /admin/)
frontend/  # React + Vite + TypeScript
```

Desplegado en https://paneles.gestionalda.es

## Desarrollo local

```bash
# backend
cd backend
python -m venv venv
venv/bin/pip install -r requirements.txt
cp .env.example .env   # y rellena los valores
venv/bin/python manage.py migrate
venv/bin/python manage.py runserver

# frontend
cd frontend
npm install
npm run dev
```

El frontend en desarrollo (`npm run dev`) proxya `/api` a `http://localhost:8000` (ver `vite.config.ts`).
