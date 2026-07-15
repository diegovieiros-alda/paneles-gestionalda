import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [status, setStatus] = useState('cargando...')

  useEffect(() => {
    fetch('/api/health/')
      .then((r) => r.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus('backend no disponible'))
  }, [])

  return (
    <section id="center">
      <h1>Paneles Gestionalda</h1>
      <p>Backend: {status}</p>
    </section>
  )
}

export default App
