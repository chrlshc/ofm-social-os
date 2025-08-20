import { useState } from 'react'
import { Dashboard } from '../components'
import Link from 'next/link'
import { 
  Home, 
  User, 
  MessageCircle, 
  BarChart3, 
  Brain, 
  Settings, 
  Bot,
  Menu,
  X
} from 'lucide-react'

export default function HomePage() {
  const [activeComponent, setActiveComponent] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, href: '/dashboard' },
    { id: 'profile', label: 'My Profile', icon: User, href: '/profile' },
    { id: 'messaging', label: 'Messages', icon: MessageCircle, href: '/messaging' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/analytics' },
    { id: 'ai-config', label: 'AI Configuration', icon: Brain, href: '/ai-config' },
    { id: 'settings', label: 'Settings', icon: Settings, href: '/settings' },
    { id: 'chatbot', label: 'AI Assistant', icon: Bot, href: '/chatbot' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0`}>
          <div className="flex items-center justify-between p-6 border-b">
            <h1 className="text-2xl font-bold gradient-text">Huntaze</h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden"
            >
              <X size={24} />
            </button>
          </div>
          
          <nav className="p-4">
            {menuItems.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors mb-2 ${
                    activeComponent === item.id
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => {
                    setActiveComponent(item.id)
                    setSidebarOpen(false)
                  }}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          {/* Mobile header */}
          <div className="lg:hidden bg-white shadow-sm p-4 flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <Menu size={24} />
            </button>
            <h1 className="text-xl font-bold gradient-text">Huntaze</h1>
            <div className="w-10" />
          </div>

          {/* Component content */}
          <div className="p-4 lg:p-0">
            <Dashboard />
          </div>
        </main>
      </div>
    </div>
  )
}