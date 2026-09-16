# 隔离TLS测试材料

public-mcp-test-cert.pem / public-mcp-test-key.pem为公开自签名测试证书/私钥，名称mcp.example.test，仅publicHttps.test.js在本机临时端口使用。不得用于生产TLS、发布签名或真实账号；不随安装器发行。测试不修改全局CA，也不关闭rejectUnauthorized。详见[公网出站实现与测试](../../src/mcp/公网出站详解.md)。
