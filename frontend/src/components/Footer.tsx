import { Code2, Github, Twitter } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-dark-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-500 to-purple-600 flex items-center justify-center">
                <Code2 className="w-4 h-4 text-white" />
              </div>
              <span className="text-lg font-bold gradient-text">CodeForge</span>
            </div>
            <p className="text-sm text-gray-500 max-w-md">
              A production-ready multi-language online compiler. Write, compile, and run code in Python, C, C++, JavaScript, PHP, Java, and Assembly.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Product</h3>
            <ul className="space-y-2">
              <li><a href="/compiler" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Compiler</a></li>
              <li><a href="/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Features</a></li>
              <li><a href="/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Languages</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-4">Connect</h3>
            <div className="flex gap-3">
              <a href="#" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all">
                <Github className="w-4 h-4" />
              </a>
              <a href="#" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all">
                <Twitter className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-gray-600">&copy; {new Date().getFullYear()} CodeForge. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Privacy</a>
            <a href="#" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
