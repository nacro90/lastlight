import { createRoot } from 'react-dom/client'

import { App } from './App'
import './ui/tokens.css'

// StrictMode kullanilmiyor: cift mount, three.js kaynaklarinin ve olay
// dinleyicilerinin iki kez kurulmasina yol acip olcumleri kirletiyor.
const container = document.getElementById('root')
if (!container) throw new Error('#root bulunamadi')

createRoot(container).render(<App />)
