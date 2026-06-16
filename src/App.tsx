import './App.css'

function App() {
  return (
    <div className="container">
      <header className="header">
        <div className="logo-container">
          <span className="logo-icon">🎮</span>
          <span className="logo-text">GameAssistant</span>
        </div>
      </header>
      
      <main className="main">
        <h1 className="title">Hello World</h1>
        <p className="subtitle">
          您的 AI 语音游戏攻略助手已就绪。稍后我们将接入语音唤醒和攻略搜索功能！
        </p>
        <div className="status-badge">
          <span className="status-dot"></span>
          <span>服务状态: 正常已部署 (HTTPS)</span>
        </div>
      </main>
      
      <footer className="footer">
        <p>© 2026 GameAssistant. Powered by Void & Cloudflare.</p>
      </footer>
    </div>
  )
}

export default App

