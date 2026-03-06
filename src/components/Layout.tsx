import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import ToastContainer from './Toast'

export default function Layout() {
  return (
    <div className="h-screen flex flex-col bg-[#1A1A2E] text-white overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
        <Sidebar />
      </div>
      <ToastContainer />
    </div>
  )
}
