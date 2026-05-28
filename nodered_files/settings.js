module.exports = {
    uiPort: process.env.PORT || 1880,
    mqttReconnectTime: 15000,
    serialReconnectTime: 15000,
    debugMaxLength: 1000,
    adminAuth: {
        type: "credentials",
        users: [{
            username: "rls",
            password: "BCRYPT_PLACEHOLDER",
            permissions: "*"
        }]
    },
    httpNodeAuth: null,
    https: null,
    requireHttps: false,
    allowFileUpload: true,
    debugUseColors: true,
    flowFile: "flows.json",
    flowFilePretty: true,
    userDir: "/data",
    nodesDir: "/data/nodes",
    logging: {
        console: {
            level: "info",
            metrics: false,
            audit: false
        }
    },
    editorTheme: {
        page: { title: "EDP - Controlo de Acesso" },
        header: { title: "EDP Node-RED", image: null },
        projects: { enabled: false }
    },
    functionGlobalContext: {},
    exportGlobalContextKeys: false,
    contextStorage: {
        default: "memory",
        memory: { module: "memory" },
        file: { module: "localfilesystem" }
    },
    externalModules: {
        autoInstall: true,
        palette: { allowInstall: true, allowUpdate: true },
        modules: { allowInstall: true }
    }
}
