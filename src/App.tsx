import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import Editor from './pages/editor/Editor'
import Voices from './pages/Voices'
import Translation from './pages/Translation'
import Avatars from './pages/Avatars'
import Recording from './pages/Recording'
import BrandStudio from './pages/BrandStudio'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/voices" element={<Voices />} />
        <Route path="/translation" element={<Translation />} />
        <Route path="/avatars" element={<Avatars />} />
        <Route path="/recording" element={<Recording />} />
        <Route path="/brand" element={<BrandStudio />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="/editor/:id" element={<Editor />} />
    </Routes>
  )
}
