import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './style.css'
import './pet.css'
import './capabilities.css'
import './theme.css'
import './glass.css'
import './startup.css'
import './workflows.css'

document.documentElement.classList.toggle('pet-document', new URLSearchParams(location.search).has('mini'))
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
