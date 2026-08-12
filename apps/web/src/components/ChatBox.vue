<template>
  <div class="container">
    <h1>📄 合同智能助手</h1>
    <p>项目骨架已搭建完成，等待 AI 辅助开发...</p>
    <div class="status">
      <span class="dot-green"></span> 后端连接正常
    </div>
  </div>
</template>

<style scoped>
.container {
  text-align: center;
  padding: 40px;
  max-width: 600px;
  margin: 0 auto;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.05);
}
h1 { color: #1a365d; font-size: 28px; }
p { color: #4a5568; margin: 16px 0; }
.status {
  margin-top: 20px;
  font-size: 14px;
  color: #38a169;
}
.dot-green {
  display: inline-block;
  width: 10px;
  height: 10px;
  background: #38a169;
  border-radius: 50%;
  margin-right: 8px;
}
</style>