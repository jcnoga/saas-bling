// ==================== CONFIGURAÇÃO GLOBAL ====================
const CONFIG = {
    DATA_SOURCE: 'SIMULATION',
    APP_MODE: 'DEMO',
    OWNER_APPROVAL_REQUIRED: true,
    OWNER_EMAIL: 'jcnvap@gmail.com'
};

// ==================== ESTADO GLOBAL ====================
let currentUser = null;
let users = JSON.parse(localStorage.getItem('users')) || [];
let simulatedData = null;
let charts = {};
let emailTemplates = JSON.parse(localStorage.getItem('emailTemplates')) || [];
let campaignHistory = JSON.parse(localStorage.getItem('campaignHistory')) || [];
let promoHistory = JSON.parse(localStorage.getItem('promoHistory')) || [];
let quillEditor = null;
let currentRecipientType = 'birthday';
let blingTokens = JSON.parse(localStorage.getItem('blingTokens')) || {
    accessToken: null,
    refreshToken: null,
    expiresAt: null
};

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', function() {
    const loggedUser = localStorage.getItem('currentUser');
    if (loggedUser) {
        currentUser = JSON.parse(loggedUser);
        showApp();
    }
    
    if (blingTokens.accessToken) {
        document.getElementById('blingAccessToken').value = blingTokens.accessToken;
        atualizarStatusBling();
    }
    
    generateSimulatedData();
    
    if (emailTemplates.length === 0) initDefaultTemplates();
    
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
});

// ==================== FUNÇÕES DE LOADING ====================
function showLoading() {
    document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

// ==================== AUTENTICAÇÃO ====================
function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
        const today = new Date();
        const trialEnd = new Date(user.trialStart);
        trialEnd.setDate(trialEnd.getDate() + (user.trialDays || 30));
        
        if (today > trialEnd && !user.credits) {
            alert('Período de teste expirado. Entre em contato com o administrador.');
            return;
        }
        
        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        showApp();
    } else {
        alert('E-mail ou senha inválidos');
    }
}

function handleRegister(event) {
    event.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    
    if (users.some(u => u.email === email)) {
        alert('E-mail já cadastrado');
        return;
    }
    
    const existingUser = users.find(u => u.email === email);
    const hasUsedTrial = existingUser ? existingUser.hasUsedTrial : false;
    
    const newUser = {
        id: Date.now(),
        name,
        email,
        password,
        trialStart: new Date().toISOString(),
        trialDays: hasUsedTrial ? 0 : 30,
        hasUsedTrial: true,
        credits: 0,
        createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));
    alert('Cadastro realizado com sucesso! Faça o login.');
    showLogin();
}

function handleForgotPassword(event) {
    event.preventDefault();
    const email = document.getElementById('forgotEmail').value;
    const user = users.find(u => u.email === email);
    alert(user ? `Instruções de recuperação enviadas para ${email} (simulado)` : 'E-mail não encontrado');
    showLogin();
}

function showRegister() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('forgotForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
}

function showLogin() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('forgotForm').classList.add('hidden');
}

function showForgotPassword() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('forgotForm').classList.remove('hidden');
}

function logout() {
    localStorage.removeItem('currentUser');
    currentUser = null;
    document.getElementById('appContainer').classList.add('hidden');
    document.getElementById('authContainer').classList.remove('hidden');
    showLogin();
}

// ==================== FUNÇÕES DE INTEGRAÇÃO BLING ====================
async function autenticarBling() {
    const clientId = document.getElementById('blingClientId').value;
    const clientSecret = document.getElementById('blingClientSecret').value;
    const authCode = document.getElementById('blingAuthCode').value;
    
    if (!clientId || !clientSecret || !authCode) {
        alert('Preencha Client ID, Client Secret e Authorization Code');
        return;
    }
    
    showLoading();
    try {
        const response = await fetch('https://api.bling.com.br/Api/v3/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: authCode,
                client_id: clientId,
                client_secret: clientSecret
            })
        });
        
        if (!response.ok) throw new Error('Falha na autenticação');
        
        const data = await response.json();
        blingTokens = {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString()
        };
        localStorage.setItem('blingTokens', JSON.stringify(blingTokens));
        document.getElementById('blingAccessToken').value = data.access_token;
        atualizarStatusBling();
        await testarConexaoBling();
        alert('✅ Autenticado com sucesso!');
    } catch (error) {
        console.error('Erro na autenticação:', error);
        alert('❌ Erro na autenticação: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function refreshBlingToken() {
    if (!blingTokens.refreshToken) throw new Error('Sem refresh token');
    
    const clientId = document.getElementById('blingClientId').value;
    const clientSecret = document.getElementById('blingClientSecret').value;
    
    const response = await fetch('https://api.bling.com.br/Api/v3/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: blingTokens.refreshToken,
            client_id: clientId,
            client_secret: clientSecret
        })
    });
    
    if (!response.ok) throw new Error('Falha ao renovar token');
    
    const data = await response.json();
    blingTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString()
    };
    localStorage.setItem('blingTokens', JSON.stringify(blingTokens));
    document.getElementById('blingAccessToken').value = data.access_token;
    return data.access_token;
}

async function getValidBlingToken() {
    if (!blingTokens.accessToken) throw new Error('Não autenticado');
    if (blingTokens.expiresAt && new Date() > new Date(blingTokens.expiresAt)) {
        return await refreshBlingToken();
    }
    return blingTokens.accessToken;
}

async function testarConexaoBling() {
    if (!blingTokens.accessToken) {
        alert('Faça a autenticação primeiro');
        return;
    }
    
    showLoading();
    try {
        const token = await getValidBlingToken();
        const response = await fetch('https://api.bling.com.br/Api/v3/contatos?limite=1', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const resultDiv = document.getElementById('blingTestResult');
        resultDiv.classList.remove('hidden');
        
        if (response.ok) {
            const data = await response.json();
            resultDiv.innerHTML = `<strong>✅ Conexão OK!</strong><br>Status: ${response.status}`;
            atualizarStatusBling(true);
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        document.getElementById('blingTestResult').innerHTML = `<strong>❌ Erro na conexão</strong><br>${error.message}`;
        atualizarStatusBling(false);
    } finally {
        hideLoading();
    }
}

function desconectarBling() {
    blingTokens = { accessToken: null, refreshToken: null, expiresAt: null };
    localStorage.removeItem('blingTokens');
    document.getElementById('blingAccessToken').value = '';
    document.getElementById('blingTestResult').classList.add('hidden');
    atualizarStatusBling(false);
    
    if (CONFIG.DATA_SOURCE === 'BLING_API') {
        CONFIG.DATA_SOURCE = 'SIMULATION';
        document.getElementById('dataSourceSelect').value = 'SIMULATION';
        updateModeBadge();
        recarregarDados();
    }
    
    alert('Desconectado da Bling API');
}

function atualizarStatusBling(conectado = false) {
    const statusText = document.getElementById('blingStatusText');
    const statusDiv = document.getElementById('blingStatus');
    
    if (blingTokens.accessToken && conectado) {
        statusText.textContent = 'Conectado';
        statusDiv.className = 'bling-status success';
    } else {
        statusText.textContent = 'Desconectado';
        statusDiv.className = 'bling-status error';
    }
}

// ==================== FUNÇÕES DE DADOS ====================
async function carregarDadosBling() {
    if (CONFIG.DATA_SOURCE !== 'BLING_API') return generateMockData();
    
    try {
        showLoading();
        console.log("🔄 Carregando dados da Bling API...");
        
        const token = await getValidBlingToken();
        const headers = { 'Authorization': `Bearer ${token}` };
        
        const [clientesRes, produtosRes] = await Promise.allSettled([
            fetch('https://api.bling.com.br/Api/v3/contatos?limite=100', { headers }),
            fetch('https://api.bling.com.br/Api/v3/produtos?limite=100', { headers })
        ]);
        
        let clientes = [], produtos = [];
        
        if (clientesRes.status === 'fulfilled' && clientesRes.value.ok) {
            const data = await clientesRes.value.json();
            clientes = data.data || [];
            console.log(`✅ ${clientes.length} clientes carregados`);
        }
        
        if (produtosRes.status === 'fulfilled' && produtosRes.value.ok) {
            const data = await produtosRes.value.json();
            produtos = data.data || [];
            console.log(`✅ ${produtos.length} produtos carregados`);
        }
        
        simulatedData = normalizeBlingData({ clientes, produtos });
        atualizarStatusBling(true);
        hideLoading();
        return simulatedData;
        
    } catch (error) {
        console.error("❌ Erro na integração Bling:", error);
        alert(`Erro ao carregar dados da Bling: ${error.message}. Usando modo simulação.`);
        CONFIG.DATA_SOURCE = 'SIMULATION';
        document.getElementById('dataSourceSelect').value = 'SIMULATION';
        updateModeBadge();
        hideLoading();
        return generateMockData();
    }
}

function normalizeBlingData(rawData) {
    return {
        clientes: (rawData.clientes || []).map(c => ({
            id: c.id,
            nome: c.nome || 'Cliente sem nome',
            cidade: c.cidade || 'Não informada',
            dataCadastro: c.data_cadastro || new Date().toISOString().split('T')[0],
            ultimaCompra: c.ultima_compra || new Date().toISOString().split('T')[0],
            aniversario: c.aniversario || '2000-01-01',
            frequencia: c.total_compras || 1,
            ticketMedio: c.ticket_medio || 150,
            totalGasto: (c.ticket_medio || 150) * (c.total_compras || 1),
            status: 'regular',
            ultimaPromo: null,
            tipoUltimaPromo: null
        })),
        produtos: (rawData.produtos || []).map(p => ({
            id: p.id,
            sku: p.codigo || `SKU${p.id}`,
            nome: p.descricao || 'Produto sem nome',
            categoria: p.categoria || 'Geral',
            custo: parseFloat(p.custo) || 50,
            preco: parseFloat(p.preco) || 100,
            margem: p.preco && p.custo ? ((p.preco - p.custo) / p.preco * 100).toFixed(1) : '50.0',
            margemDecimal: p.preco && p.custo ? (p.preco - p.custo) / p.preco : 0.5,
            estoque: parseInt(p.estoque) || 10,
            giro: parseFloat(p.giro) || 5,
            curva: 'B',
            diasSemVenda: p.dias_ultima_venda || 0,
            valorEstoque: (parseFloat(p.custo) || 50) * (parseInt(p.estoque) || 10),
            status: 'normal'
        })),
        vendas: [],
        faturamentoMensal: Array(12).fill(30000),
        custosFixos: 15000,
        custosVariaveis: Array(12).fill(9000),
        aliquotaImpostos: 0.12
    };
}

function generateMockData() {
    console.log("🎯 Gerando dados simulados...");
    
    const clientes = [];
    const nomes = ['Ana', 'João', 'Maria', 'Pedro', 'Carla', 'Lucas', 'Juliana', 'Rafael', 'Fernanda', 'Gabriel'];
    const sobrenomes = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Alves', 'Ferreira', 'Costa', 'Gomes'];
    const cidades = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Curitiba', 'Porto Alegre', 'Salvador', 'Fortaleza', 'Brasília'];
    
    for (let i = 0; i < 200; i++) {
        const nome = nomes[Math.floor(Math.random() * nomes.length)];
        const sobrenome = sobrenomes[Math.floor(Math.random() * sobrenomes.length)];
        const dataCadastro = new Date();
        dataCadastro.setDate(dataCadastro.getDate() - Math.floor(Math.random() * 365));
        
        const ultimaCompra = new Date();
        ultimaCompra.setDate(ultimaCompra.getDate() - Math.floor(Math.random() * 90));
        
        const aniversario = new Date();
        aniversario.setMonth(Math.floor(Math.random() * 12));
        aniversario.setDate(Math.floor(Math.random() * 28) + 1);
        
        const frequencia = Math.floor(Math.random() * 10) + 1;
        const ticketMedio = Math.floor(Math.random() * 230) + 120;
        
        const diasInativo = Math.floor((new Date() - ultimaCompra) / (1000 * 60 * 60 * 24));
        let status = 'regular';
        if (diasInativo > 90) status = 'sumido';
        else if (diasInativo > 60) status = 'inativo';
        else if (frequencia > 8) status = 'vip';
        else if (frequencia > 5) status = 'fiel';
        
        clientes.push({
            id: i + 1,
            nome: `${nome} ${sobrenome}`,
            cidade: cidades[Math.floor(Math.random() * cidades.length)],
            dataCadastro: dataCadastro.toISOString().split('T')[0],
            ultimaCompra: ultimaCompra.toISOString().split('T')[0],
            aniversario: aniversario.toISOString().split('T')[0],
            frequencia,
            ticketMedio,
            totalGasto: ticketMedio * frequencia,
            status,
            ultimaPromo: null,
            tipoUltimaPromo: null
        });
    }
    
    const produtos = [];
    const categorias = ['Feminino', 'Masculino', 'Infantil', 'Acessórios'];
    const nomesProdutos = {
        'Feminino': ['Vestido Floral', 'Blusa de Seda', 'Calça Jeans', 'Saia Midi', 'Blazer', 'Camiseta Básica'],
        'Masculino': ['Camisa Social', 'Calça Chino', 'Polo', 'Blazer', 'Camiseta', 'Bermuda'],
        'Infantil': ['Macacão', 'Conjunto', 'Vestido', 'Camiseta', 'Calça', 'Jaqueta'],
        'Acessórios': ['Bolsa', 'Cinto', 'Chapéu', 'Óculos', 'Relógio', 'Carteira']
    };
    
    for (let i = 0; i < 250; i++) {
        const categoria = categorias[Math.floor(Math.random() * categorias.length)];
        const nomeBase = nomesProdutos[categoria][Math.floor(Math.random() * nomesProdutos[categoria].length)];
        const custo = Math.floor(Math.random() * 150) + 30;
        const margem = 0.4 + (Math.random() * 0.3);
        const preco = Math.round(custo * (1 + margem));
        const estoque = Math.floor(Math.random() * 50);
        const giro = Math.floor(Math.random() * 20) + 1;
        const diasSemVenda = Math.floor(Math.random() * 120);
        
        let curva = 'C';
        if (giro > 15) curva = 'A';
        else if (giro > 8) curva = 'B';
        
        let status = 'normal';
        if (estoque === 0) status = 'ruptura';
        else if (estoque < 5) status = 'risco-ruptura';
        else if (diasSemVenda > 90) status = 'encalhado';
        else if (giro > 15) status = 'alto-giro';
        else if (giro < 5) status = 'baixo-giro';
        
        produtos.push({
            id: i + 1,
            sku: `SKU${String(i + 1).padStart(5, '0')}`,
            nome: `${nomeBase} ${i + 1}`,
            categoria,
            custo,
            preco,
            margem: ((preco - custo) / preco * 100).toFixed(1),
            margemDecimal: (preco - custo) / preco,
            estoque,
            giro,
            curva,
            diasSemVenda,
            valorEstoque: custo * estoque,
            status
        });
    }
    
    const vendas = [];
    const meses = 12;
    const faturamentoMensal = [];
    const sazonalidade = [0.9, 0.8, 0.9, 1.0, 1.1, 1.0, 0.9, 0.8, 1.0, 1.1, 1.2, 1.5];
    
    for (let m = 0; m < meses; m++) {
        const baseFaturamento = 45000 + (Math.random() * 20000 - 10000);
        const mesFaturamento = Math.round(baseFaturamento * sazonalidade[m]);
        faturamentoMensal.push(mesFaturamento);
        
        const numVendas = Math.floor(mesFaturamento / 200);
        
        for (let i = 0; i < numVendas; i++) {
            const cliente = clientes[Math.floor(Math.random() * clientes.length)];
            const produto = produtos[Math.floor(Math.random() * produtos.length)];
            const quantidade = Math.floor(Math.random() * 3) + 1;
            const data = new Date(2024, m, Math.floor(Math.random() * 28) + 1);
            
            const cancelada = Math.random() < 0.05;
            const parcelado = Math.random() < 0.3;
            
            vendas.push({
                id: vendas.length + 1,
                data: data.toISOString().split('T')[0],
                cliente: cliente.nome,
                clienteId: cliente.id,
                produto: produto.nome,
                produtoId: produto.id,
                categoria: produto.categoria,
                quantidade,
                precoUnitario: produto.preco,
                total: produto.preco * quantidade,
                custoTotal: produto.custo * quantidade,
                lucro: (produto.preco - produto.custo) * quantidade,
                margemRealizada: ((produto.preco - produto.custo) / produto.preco * 100).toFixed(1),
                status: cancelada ? 'cancelada' : 'concluida',
                pagamento: parcelado ? 'parcelado' : 'vista'
            });
        }
    }
    
    simulatedData = {
        clientes,
        produtos,
        vendas,
        faturamentoMensal,
        custosFixos: 15000 + Math.random() * 5000,
        custosVariaveis: faturamentoMensal.map(f => f * 0.3),
        aliquotaImpostos: 0.12
    };
    
    return simulatedData;
}

async function generateSimulatedData() {
    if (CONFIG.DATA_SOURCE === 'BLING_API') {
        return await carregarDadosBling();
    } else {
        return generateMockData();
    }
}

function showApp() {
    document.getElementById('authContainer').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    
    document.getElementById('userNameDisplay').textContent = currentUser.name;
    document.getElementById('userEmailDisplay').textContent = currentUser.email;
    
    const trialEnd = new Date(currentUser.trialStart);
    trialEnd.setDate(trialEnd.getDate() + (currentUser.trialDays || 30));
    const today = new Date();
    const daysLeft = Math.max(0, Math.ceil((trialEnd - today) / (1000 * 60 * 60 * 24)));
    
    document.getElementById('trialDaysDisplay').textContent = 
        daysLeft > 0 ? `${daysLeft} dias de teste` : 'Teste expirado';
    
    updateModeBadge();
    
    generateSimulatedData().then(() => {
        navigateTo('dashboard');
    });
}

function updateModeBadge() {
    const badge = document.getElementById('modeBadge');
    const source = CONFIG.DATA_SOURCE === 'BLING_API' ? 'BLING' : 'SIMULAÇÃO';
    badge.textContent = `MODO ${source} | ${CONFIG.APP_MODE}`;
    badge.className = `mode-badge ${CONFIG.DATA_SOURCE === 'BLING_API' ? 'bling' : 'demo'}`;
    
    document.getElementById('dataSourceSelect').value = CONFIG.DATA_SOURCE;
    document.getElementById('appModeSelect').value = CONFIG.APP_MODE;
}

function changeDataSource() {
    CONFIG.DATA_SOURCE = document.getElementById('dataSourceSelect').value;
    updateModeBadge();
    recarregarDados();
}

function changeAppMode() {
    CONFIG.APP_MODE = document.getElementById('appModeSelect').value;
    updateModeBadge();
    
    if (CONFIG.APP_MODE === 'AUTHORIZED' && currentUser?.email !== CONFIG.OWNER_EMAIL) {
        alert('Modo Autorizado requer permissão do proprietário');
        CONFIG.APP_MODE = 'DEMO';
        document.getElementById('appModeSelect').value = 'DEMO';
        updateModeBadge();
    }
}

async function recarregarDados() {
    showLoading();
    await generateSimulatedData();
    
    const activeNav = document.querySelector('.nav-item.active span').textContent.toLowerCase();
    navigateTo(activeNav);
    
    hideLoading();
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

function navigateTo(section) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget.classList.add('active');
    
    document.getElementById('dashboardContent').classList.add('hidden');
    document.getElementById('clientesContent').classList.add('hidden');
    document.getElementById('produtosContent').classList.add('hidden');
    document.getElementById('vendasContent').classList.add('hidden');
    document.getElementById('financeiroContent').classList.add('hidden');
    document.getElementById('emailMarketingContent').classList.add('hidden');
    document.getElementById('relatoriosContent').classList.add('hidden');
    document.getElementById('configuracoesContent').classList.add('hidden');
    document.getElementById('strategicInsight').classList.add('hidden');
    
    if (section === 'dashboard') {
        document.getElementById('dashboardContent').classList.remove('hidden');
        document.getElementById('strategicInsight').classList.remove('hidden');
        renderDashboard();
    } else if (section === 'clientes') {
        document.getElementById('clientesContent').classList.remove('hidden');
        renderClients();
    } else if (section === 'produtos') {
        document.getElementById('produtosContent').classList.remove('hidden');
        renderProducts();
    } else if (section === 'vendas') {
        document.getElementById('vendasContent').classList.remove('hidden');
        renderVendas();
        setCurrentMonthFilter();
    } else if (section === 'financeiro') {
        document.getElementById('financeiroContent').classList.remove('hidden');
        renderFinanceiro();
    } else if (section === 'email-marketing') {
        document.getElementById('emailMarketingContent').classList.remove('hidden');
        renderEmailMarketing();
    } else if (section === 'relatorios') {
        document.getElementById('relatoriosContent').classList.remove('hidden');
        gerarRelatorio();
        atualizarRankings();
    } else if (section === 'configuracoes') {
        document.getElementById('configuracoesContent').classList.remove('hidden');
        
        if (currentUser && currentUser.email === CONFIG.OWNER_EMAIL) {
            document.getElementById('ownerControlsSection').classList.remove('hidden');
        } else {
            document.getElementById('ownerControlsSection').classList.add('hidden');
        }
    }
}

// ==================== FUNÇÕES DE CLIENTES ====================
function setCurrentMonthClientFilter() {
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    
    document.getElementById('clientStartDate').value = primeiroDia.toISOString().split('T')[0];
    document.getElementById('clientEndDate').value = ultimoDia.toISOString().split('T')[0];
    
    filterClients();
}

function filterClients() {
    if (!simulatedData) return;
    
    const startDate = document.getElementById('clientStartDate').value;
    const endDate = document.getElementById('clientEndDate').value;
    const search = document.getElementById('clientSearch').value;
    const statusFilter = document.getElementById('clientStatusFilter').value;
    
    let filtered = simulatedData.clientes;
    
    if (startDate) {
        filtered = filtered.filter(c => c.dataCadastro >= startDate);
    }
    
    if (endDate) {
        filtered = filtered.filter(c => c.dataCadastro <= endDate);
    }
    
    if (statusFilter) {
        if (statusFilter === 'aniversariante') {
            const mesAtual = new Date().getMonth() + 1;
            filtered = filtered.filter(c => {
                const mes = new Date(c.aniversario).getMonth() + 1;
                return mes === mesAtual;
            });
        } else if (statusFilter === 'promo-enviada') {
            filtered = filtered.filter(c => c.ultimaPromo);
        } else {
            filtered = filtered.filter(c => c.status === statusFilter);
        }
    }
    
    if (search) {
        filtered = filtered.filter(c => 
            c.nome.toLowerCase().includes(search.toLowerCase()) ||
            c.cidade.toLowerCase().includes(search.toLowerCase())
        );
    }
    
    renderFilteredClients(filtered);
}

function renderFilteredClients(clientes) {
    const tbody = document.getElementById('clientsTableBody');
    
    tbody.innerHTML = clientes.map(c => {
        let statusBadge = '';
        let statusClass = '';
        
        if (c.status === 'vip') {
            statusBadge = '👑 VIP';
            statusClass = 'status-vip';
        } else if (c.status === 'fiel') {
            statusBadge = '🟢 Fiel';
            statusClass = 'status-active';
        } else if (c.status === 'regular') {
            statusBadge = '🟡 Regular';
            statusClass = 'status-risk';
        } else if (c.status === 'inativo') {
            statusBadge = '🔴 Inativo';
            statusClass = 'status-inactive';
        } else if (c.status === 'sumido') {
            statusBadge = '⚠️ Sumido';
            statusClass = 'status-inactive';
        }
        
        const mesAtual = new Date().getMonth() + 1;
        const mesAniversario = new Date(c.aniversario).getMonth() + 1;
        if (mesAniversario === mesAtual) {
            statusBadge = '🎂 Aniversariante';
            statusClass = 'status-active';
        }
        
        const promoBadge = c.ultimaPromo ? 
            `<span class="status-badge status-promo">📧 ${new Date(c.ultimaPromo).toLocaleDateString('pt-BR')}</span>` : 
            '-';
        
        return `
        <tr>
            <td>${c.nome}</td>
            <td>${c.cidade}</td>
            <td>${new Date(c.dataCadastro).toLocaleDateString('pt-BR')}</td>
            <td>${new Date(c.aniversario).toLocaleDateString('pt-BR')}</td>
            <td>${new Date(c.ultimaCompra).toLocaleDateString('pt-BR')}</td>
            <td>${c.frequencia}</td>
            <td>R$ ${c.ticketMedio.toFixed(2)}</td>
            <td>
                <span class="status-badge ${statusClass}">${statusBadge}</span>
            </td>
            <td>${promoBadge}</td>
            <td>
                <button class="btn-secondary btn-sm" onclick="showClientPromoHistory('${c.nome}')" title="Ver histórico">
                    <i class="fas fa-history"></i>
                </button>
                <button class="btn-secondary btn-sm" onclick="sendPromo('${c.nome}')" title="Enviar promoção">
                    <i class="fas fa-gift"></i>
                </button>
            </td>
        </tr>
    `}).join('');
}

function showClientPromoHistory(clienteNome) {
    const historico = promoHistory.filter(p => p.cliente === clienteNome)
        .sort((a, b) => new Date(b.data) - new Date(a.data));
    
    const modal = document.getElementById('promoHistoryModal');
    const content = document.getElementById('promoHistoryContent');
    
    if (historico.length === 0) {
        content.innerHTML = '<p style="text-align: center; color: var(--gray-500);">Nenhuma promoção enviada para este cliente.</p>';
    } else {
        content.innerHTML = historico.map(p => `
            <div class="promo-item">
                <div class="promo-type">${p.tipo}</div>
                <div class="promo-date">📅 ${new Date(p.data).toLocaleString('pt-BR')}</div>
                <div>📧 ${p.campanha}</div>
            </div>
        `).join('');
    }
    
    modal.classList.remove('hidden');
}

function closePromoHistory() {
    document.getElementById('promoHistoryModal').classList.add('hidden');
}

function renderClients() {
    document.getElementById('clientStartDate').value = '';
    document.getElementById('clientEndDate').value = '';
    document.getElementById('clientSearch').value = '';
    document.getElementById('clientStatusFilter').value = '';
    
    setCurrentMonthClientFilter();
}

// ==================== FUNÇÕES DE PRODUTOS ====================
function filterProducts() {
    if (!simulatedData) return;
    
    const categoria = document.getElementById('productCategoryFilter').value;
    const statusFilter = document.getElementById('productStatusFilter').value;
    const excludeNormal = document.getElementById('excludeNormalProducts').checked;
    
    let filtered = simulatedData.produtos;
    
    if (categoria) {
        filtered = filtered.filter(p => p.categoria === categoria);
    }
    
    if (statusFilter) {
        filtered = filtered.filter(p => p.status === statusFilter);
    }
    
    if (excludeNormal) {
        filtered = filtered.filter(p => p.status !== 'normal');
    }
    
    const encalhados = filtered.filter(p => p.status === 'encalhado');
    const capitalParado = encalhados.reduce((acc, p) => acc + p.valorEstoque, 0);
    
    const ruptura = filtered.filter(p => p.status === 'ruptura').length;
    const riscoRuptura = filtered.filter(p => p.status === 'risco-ruptura').length;
    
    const altoGiro = filtered.filter(p => p.status === 'alto-giro');
    const giroMedioAlto = altoGiro.length > 0 ? 
        (altoGiro.reduce((acc, p) => acc + p.giro, 0) / altoGiro.length).toFixed(1) : 0;
    
    const baixoGiro = filtered.filter(p => p.status === 'baixo-giro');
    const giroMedioBaixo = baixoGiro.length > 0 ? 
        (baixoGiro.reduce((acc, p) => acc + p.giro, 0) / baixoGiro.length).toFixed(1) : 0;
    
    document.getElementById('encalhadosCount').textContent = encalhados.length;
    document.getElementById('capitalParado').textContent = 'R$ ' + capitalParado.toFixed(2);
    document.getElementById('rupturaCount').textContent = ruptura;
    document.getElementById('riscoCount').textContent = riscoRuptura;
    document.getElementById('altoGiroCount').textContent = altoGiro.length;
    document.getElementById('giroMedioAlto').textContent = giroMedioAlto;
    document.getElementById('baixoGiroCount').textContent = baixoGiro.length;
    document.getElementById('giroMedioBaixo').textContent = giroMedioBaixo;
    
    const tbody = document.getElementById('productsTableBody');
    tbody.innerHTML = filtered.slice(0, 50).map(p => {
        let statusClass = '';
        let statusText = '';
        
        switch(p.status) {
            case 'ruptura':
                statusClass = 'status-inactive';
                statusText = '🔴 Ruptura';
                break;
            case 'risco-ruptura':
                statusClass = 'status-risk';
                statusText = '🟡 Risco Ruptura';
                break;
            case 'encalhado':
                statusClass = 'status-inactive';
                statusText = '📦 Encalhado';
                break;
            case 'alto-giro':
                statusClass = 'status-active';
                statusText = '⚡ Alto Giro';
                break;
            case 'baixo-giro':
                statusClass = 'status-risk';
                statusText = '🐢 Baixo Giro';
                break;
            default:
                statusClass = 'status-active';
                statusText = '🟢 Normal';
        }
        
        return `
        <tr>
            <td>${p.sku}</td>
            <td>${p.nome}</td>
            <td>${p.categoria}</td>
            <td>R$ ${p.custo.toFixed(2)}</td>
            <td>R$ ${p.preco.toFixed(2)}</td>
            <td>${p.margem}%</td>
            <td>${p.estoque}</td>
            <td>${p.giro}x</td>
            <td>${p.diasSemVenda}</td>
            <td>
                <span class="status-badge" style="background-color: ${p.curva === 'A' ? '#1a3b5c' : (p.curva === 'B' ? '#2ecc71' : '#e74c3c')}; color: white;">
                    ${p.curva}
                </span>
            </td>
            <td>
                <span class="status-badge ${statusClass}">
                    ${statusText}
                </span>
            </td>
        </tr>
    `}).join('');
}

function renderProducts() {
    document.getElementById('productCategoryFilter').value = '';
    document.getElementById('productStatusFilter').value = '';
    document.getElementById('excludeNormalProducts').checked = true;
    
    filterProducts();
}

// ==================== FUNÇÕES DE VENDAS ====================
function setCurrentMonthFilter() {
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    
    document.getElementById('vendaStartDate').value = primeiroDia.toISOString().split('T')[0];
    document.getElementById('vendaEndDate').value = ultimoDia.toISOString().split('T')[0];
    
    filterVendas();
}

function renderVendas() {
    if (!simulatedData) return;
    
    setCurrentMonthFilter();
}

function filterVendas() {
    if (!simulatedData) return;
    
    const startDate = document.getElementById('vendaStartDate').value;
    const endDate = document.getElementById('vendaEndDate').value;
    const statusFilter = document.getElementById('vendaStatusFilter').value;
    
    let filtered = simulatedData.vendas || [];
    
    if (startDate) {
        filtered = filtered.filter(v => v.data >= startDate);
    }
    
    if (endDate) {
        filtered = filtered.filter(v => v.data <= endDate);
    }
    
    if (statusFilter) {
        filtered = filtered.filter(v => v.status === statusFilter);
    }
    
    const tbody = document.getElementById('vendasTableBody');
    tbody.innerHTML = filtered.slice(0, 100).map(v => `
        <tr>
            <td>${new Date(v.data).toLocaleDateString('pt-BR')}</td>
            <td>${v.cliente}</td>
            <td>${v.produto}</td>
            <td>${v.categoria || ''}</td>
            <td>${v.quantidade}</td>
            <td>R$ ${v.total.toFixed(2)}</td>
            <td>${v.pagamento === 'parcelado' ? '📅 Parcelado' : '💵 À vista'}</td>
            <td>
                <span class="status-badge ${v.status === 'concluida' ? 'status-active' : 'status-inactive'}">
                    ${v.status === 'concluida' ? '✅ Concluída' : '❌ Cancelada'}
                </span>
            </td>
        </tr>
    `).join('');
    
    const totalVendas = filtered.length;
    const canceladas = filtered.filter(v => v.status === 'cancelada').length;
    const taxaCancelamento = totalVendas > 0 ? ((canceladas / totalVendas) * 100).toFixed(1) : 0;
    const vendasPrazo = filtered.filter(v => v.pagamento === 'parcelado').length;
    const percPrazo = totalVendas > 0 ? ((vendasPrazo / totalVendas) * 100).toFixed(1) : 0;
    const totalValor = filtered.reduce((acc, v) => acc + v.total, 0);
    const ticketMedio = totalVendas > 0 ? (totalValor / totalVendas).toFixed(2) : 0;
    
    document.getElementById('totalVendasCount').textContent = totalVendas;
    document.getElementById('taxaCancelamento').textContent = taxaCancelamento + '%';
    document.getElementById('vendasPrazo').textContent = percPrazo + '%';
    document.getElementById('vendasTicketMedio').textContent = 'R$ ' + ticketMedio;
}

// ==================== FUNÇÕES FINANCEIRAS ====================
function renderFinanceiro() {
    if (!simulatedData) return;
    
    const meses = parseInt(document.getElementById('periodoFilter').value);
    
    const receitaTotal = simulatedData.faturamentoMensal.slice(-meses).reduce((a, b) => a + b, 0);
    const custosFixosTotal = simulatedData.custosFixos * meses;
    const custosVariaveisTotal = simulatedData.faturamentoMensal.slice(-meses).reduce((a, b) => a + (b * 0.3), 0);
    const impostosTotal = receitaTotal * simulatedData.aliquotaImpostos;
    const custosTotais = custosFixosTotal + custosVariaveisTotal + impostosTotal;
    const lucroTotal = receitaTotal - custosTotais;
    
    const margemContribuicao = receitaTotal - custosVariaveisTotal - impostosTotal;
    const percMargemContribuicao = margemContribuicao / receitaTotal;
    const pontoEquilibrio = custosFixosTotal / percMargemContribuicao / meses;
    
    const totalVendas = simulatedData.vendas.length;
    const ticketMedio = totalVendas > 0 ? receitaTotal / totalVendas : 0;
    
    const mesAtual = simulatedData.faturamentoMensal[simulatedData.faturamentoMensal.length - 1];
    const mesAnterior = simulatedData.faturamentoMensal[simulatedData.faturamentoMensal.length - 2];
    const crescimento = ((mesAtual - mesAnterior) / mesAnterior * 100).toFixed(1);
    
    const vendasCanceladas = simulatedData.vendas.filter(v => v.status === 'cancelada').length;
    const inadimplencia = totalVendas > 0 ? (vendasCanceladas / totalVendas * 100).toFixed(1) : 0;
    
    const estoqueMedio = simulatedData.produtos.reduce((acc, p) => acc + p.valorEstoque, 0);
    const cmv = custosVariaveisTotal;
    const giroCaixa = estoqueMedio > 0 ? (cmv / estoqueMedio).toFixed(2) : 0;
    
    const lucratividade = receitaTotal > 0 ? (lucroTotal / receitaTotal * 100).toFixed(1) : 0;
    
    document.getElementById('receitaTotal').textContent = 'R$ ' + receitaTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2});
    document.getElementById('margemContribuicao').textContent = 'R$ ' + margemContribuicao.toLocaleString('pt-BR', {minimumFractionDigits: 2});
    document.getElementById('pontoEquilibrio').textContent = 'R$ ' + pontoEquilibrio.toLocaleString('pt-BR', {minimumFractionDigits: 2});
    document.getElementById('ticketMedioFinanceiro').textContent = 'R$ ' + ticketMedio.toLocaleString('pt-BR', {minimumFractionDigits: 2});
    document.getElementById('crescimentoPercent').textContent = crescimento + '%';
    document.getElementById('inadimplencia').textContent = inadimplencia + '%';
    document.getElementById('giroCaixa').textContent = giroCaixa + 'x';
    document.getElementById('lucratividade').textContent = lucratividade + '%';
    
    gerarConsultoriaFinanceira(receitaTotal, custosFixosTotal, custosVariaveisTotal, impostosTotal, lucroTotal, margemContribuicao, pontoEquilibrio, ticketMedio, crescimento, inadimplencia, giroCaixa, lucratividade);
    
    simularReducaoCustos();
    simularAumentoTicket();
    simularAumentoVendas();
}

function gerarConsultoriaFinanceira(receita, custosFixos, custosVariaveis, impostos, lucro, margemContrib, pontoEquilibrio, ticketMedio, crescimento, inadimplencia, giroCaixa, lucratividade) {
    const strengths = [];
    const weaknesses = [];
    const opportunities = [];
    
    if (lucratividade > 20) {
        strengths.push("✅ Lucratividade excelente acima de 20% - negócio altamente rentável");
    } else if (lucratividade > 10) {
        strengths.push("✅ Lucratividade saudável entre 10-20% - boa geração de valor");
    }
    
    if (giroCaixa > 6) {
        strengths.push("✅ Alto giro de estoque - capital de giro eficiente");
    }
    
    if (crescimento > 10) {
        strengths.push("✅ Crescimento acelerado acima de 10% - empresa em expansão");
    }
    
    if (inadimplencia < 3) {
        strengths.push("✅ Baixíssima inadimplência - gestão de crédito eficiente");
    }
    
    if (lucratividade < 5) {
        weaknesses.push("❌ Lucratividade crítica abaixo de 5% - risco de sustentabilidade");
    } else if (lucratividade < 10) {
        weaknesses.push("⚠️ Lucratividade abaixo do ideal - necessidade de revisão de preços ou custos");
    }
    
    if (inadimplencia > 8) {
        weaknesses.push("❌ Alta inadimplência acima de 8% - revisar política de crédito urgente");
    } else if (inadimplencia > 5) {
        weaknesses.push("⚠️ Inadimplência acima da média - fortalecer cobrança");
    }
    
    if (giroCaixa < 3) {
        weaknesses.push("❌ Baixíssimo giro de estoque - capital parado em produtos encalhados");
    } else if (giroCaixa < 5) {
        weaknesses.push("⚠️ Giro de estoque abaixo do ideal - revisar mix de produtos");
    }
    
    if (crescimento < 0) {
        weaknesses.push("❌ Retração nas vendas - identificar causas e agir rápido");
    }
    
    if (margemContrib / receita < 0.4) {
        opportunities.push("💡 Margem de contribuição baixa - renegociar com fornecedores pode aumentar lucro em até 15%");
    }
    
    if (impostos / receita > 0.15) {
        opportunities.push("💡 Carga tributária elevada - consultar contador sobre regime tributário mais vantajoso");
    }
    
    if (ticketMedio < 200) {
        opportunities.push("💡 Ticket médio baixo - estratégias de upsell podem aumentar faturamento em 20%");
    }
    
    if (custosFixos / receita > 0.3) {
        opportunities.push("💡 Estrutura de custos fixos alta - avaliar redução de despesas operacionais");
    }
    
    const consultingDiv = document.getElementById('financialConsulting');
    consultingDiv.innerHTML = `
        <div class="consulting-card strength">
            <h4>✅ Pontos Fortes</h4>
            <ul class="consulting-list">
                ${strengths.length > 0 ? strengths.map(s => `<li>${s}</li>`).join('') : '<li>Nenhum ponto forte significativo identificado</li>'}
            </ul>
        </div>
        <div class="consulting-card weakness">
            <h4>⚠️ Pontos Fracos e Riscos</h4>
            <ul class="consulting-list">
                ${weaknesses.length > 0 ? weaknesses.map(w => `<li>${w}</li>`).join('') : '<li>Nenhum ponto fraco crítico identificado</li>'}
            </ul>
        </div>
        <div class="consulting-card opportunity">
            <h4>💡 Oportunidades de Melhoria</h4>
            <ul class="consulting-list">
                ${opportunities.length > 0 ? opportunities.map(o => `<li>${o}</li>`).join('') : '<li>Continue monitorando para identificar novas oportunidades</li>'}
            </ul>
        </div>
    `;
    
    let recomendacao = '';
    if (lucratividade < 10) {
        recomendacao = "🔴 **Prioridade Máxima:** Sua lucratividade está abaixo do ideal. Recomendamos revisar urgentemente sua precificação e negociar com fornecedores. Uma melhoria de 5% na margem pode representar R$ " + (receita * 0.05).toFixed(2) + " adicionais ao ano.";
    } else if (giroCaixa < 4) {
        recomendacao = "🟡 **Atenção:** Seu capital está parado em estoque. Considere uma liquidação para produtos encalhados e revise sua política de compras. Liberar R$ " + (simulatedData.produtos.reduce((acc, p) => acc + p.valorEstoque, 0) * 0.3).toFixed(2) + " em caixa pode ser possível.";
    } else if (crescimento < 5 && crescimento > 0) {
        recomendacao = "🟢 **Oportunidade:** Crescimento moderado. Invista em marketing digital e campanhas de email marketing para acelerar. Um aumento de 10% nas vendas adicionaria R$ " + (receita * 0.1).toFixed(2) + " ao ano.";
    } else {
        recomendacao = "✅ **Saúde Financeira:** Seus indicadores estão saudáveis. Foque em manter a tendência e explore novas linhas de produtos para diversificar receitas.";
    }
    
    document.getElementById('financialRecommendation').innerHTML = `
        <strong>🎯 Recomendação Estratégica:</strong><br>
        ${recomendacao}
    `;
}

function simularReducaoCustos() {
    const reducao = document.getElementById('reducaoCustos').value;
    document.getElementById('reducaoPercent').textContent = reducao + '%';
    
    const receita = simulatedData.faturamentoMensal[simulatedData.faturamentoMensal.length - 1];
    const custosAtuais = simulatedData.custosFixos + (receita * 0.3) + (receita * simulatedData.aliquotaImpostos);
    const reducaoValor = custosAtuais * (reducao / 100);
    const novoLucro = (receita - custosAtuais) + reducaoValor;
    
    document.getElementById('resultadoSimulacao').innerHTML = 
        `Com ${reducao}% de redução: R$ ${novoLucro.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

function simularAumentoTicket() {
    const aumento = document.getElementById('aumentoTicket').value;
    document.getElementById('aumentoPercent').textContent = aumento + '%';
    
    const receita = simulatedData.faturamentoMensal[simulatedData.faturamentoMensal.length - 1];
    const novaReceita = receita * (1 + (aumento / 100));
    const custos = simulatedData.custosFixos + (receita * 0.3) + (receita * simulatedData.aliquotaImpostos);
    const novoLucro = novaReceita - custos;
    
    document.getElementById('resultadoTicket').innerHTML = 
        `Com ${aumento}% de aumento: R$ ${novoLucro.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

function simularAumentoVendas() {
    const aumento = document.getElementById('aumentoVendas').value;
    document.getElementById('aumentoVendasPercent').textContent = aumento + '%';
    
    const receita = simulatedData.faturamentoMensal[simulatedData.faturamentoMensal.length - 1];
    const novaReceita = receita * (1 + (aumento / 100));
    const custos = simulatedData.custosFixos + (novaReceita * 0.3) + (novaReceita * simulatedData.aliquotaImpostos);
    const novoLucro = novaReceita - custos;
    
    document.getElementById('resultadoVendas').innerHTML = 
        `Com ${aumento}% de aumento: R$ ${novoLucro.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
}

// ==================== FUNÇÕES DE DASHBOARD ====================
function renderDashboard() {
    if (!simulatedData) return;
    
    const isAuthorized = CONFIG.APP_MODE === 'AUTHORIZED' || currentUser?.email === CONFIG.OWNER_EMAIL;
    
    const mesAtual = simulatedData.faturamentoMensal[simulatedData.faturamentoMensal.length - 1];
    const mesAnterior = simulatedData.faturamentoMensal[simulatedData.faturamentoMensal.length - 2];
    const crescimento = ((mesAtual - mesAnterior) / mesAnterior * 100).toFixed(1);
    
    const receitaBruta = mesAtual;
    const custosTotais = simulatedData.custosFixos + (mesAtual * 0.3) + (mesAtual * simulatedData.aliquotaImpostos);
    const lucro = receitaBruta - custosTotais;
    const margem = (lucro / receitaBruta * 100).toFixed(1);
    
    const clientesAtivos = simulatedData.clientes.filter(c => c.status !== 'inativo' && c.status !== 'sumido').length;
    const retencao = (clientesAtivos / simulatedData.clientes.length * 100).toFixed(1);
    
    const vendasMes = simulatedData.vendas.filter(v => v.data.startsWith('2024-12')).length;
    const ticketMedio = vendasMes > 0 ? receitaBruta / vendasMes : 0;
    
    const kpis = [
        {
            title: 'Receita Bruta',
            value: receitaBruta,
            format: 'currency',
            comparison: crescimento,
            badge: crescimento > 5 ? '🟢 Saudável' : (crescimento > 0 ? '🟡 Atenção' : '🔴 Risco'),
            tooltip: 'Receita total de vendas antes de deduções.'
        },
        {
            title: 'Lucro Operacional',
            value: lucro,
            format: 'currency',
            comparison: ((lucro / (mesAnterior * 0.3) * 100) - 100).toFixed(1),
            badge: margem > 40 ? '🟢 Saudável' : (margem > 30 ? '🟡 Atenção' : '🔴 Risco'),
            tooltip: 'Resultado após custos fixos, variáveis e impostos.'
        },
        {
            title: 'Margem Líquida',
            value: margem,
            format: 'percent',
            comparison: null,
            badge: margem > 40 ? '🟢 Saudável' : (margem > 30 ? '🟡 Atenção' : '🔴 Risco'),
            tooltip: 'Percentual de lucro sobre receita.'
        },
        {
            title: 'Ticket Médio',
            value: ticketMedio,
            format: 'currency',
            comparison: ((ticketMedio / 200) * 100 - 100).toFixed(1),
            badge: ticketMedio > 250 ? '🟢 Saudável' : (ticketMedio > 180 ? '🟡 Atenção' : '🔴 Risco'),
            tooltip: 'Valor médio por venda.'
        },
        {
            title: 'Retenção',
            value: retencao,
            format: 'percent',
            comparison: null,
            badge: retencao > 70 ? '🟢 Saudável' : (retencao > 50 ? '🟡 Atenção' : '🔴 Risco'),
            tooltip: 'Percentual de clientes que voltaram a comprar'
        },
        {
            title: 'Crescimento',
            value: crescimento,
            format: 'percent',
            comparison: null,
            badge: crescimento > 5 ? '🟢 Saudável' : (crescimento > 0 ? '🟡 Atenção' : '🔴 Risco'),
            tooltip: 'Variação da receita em relação ao mês anterior'
        }
    ];
    
    const kpiGrid = document.getElementById('kpiGrid');
    kpiGrid.innerHTML = kpis.map(kpi => `
        <div class="kpi-card">
            <div class="kpi-header">
                <span class="kpi-title">
                    ${kpi.title}
                    <i class="fas fa-info-circle tooltip">
                        <span class="tooltip-text">${kpi.tooltip}</span>
                    </i>
                </span>
                <span class="kpi-badge ${kpi.badge.includes('🟢') ? 'badge-green' : (kpi.badge.includes('🟡') ? 'badge-yellow' : 'badge-red')}">
                    ${kpi.badge}
                </span>
            </div>
            <div class="kpi-value">
                ${kpi.format === 'currency' ? 'R$ ' + kpi.value.toLocaleString('pt-BR', {minimumFractionDigits: 2}) : 
                  kpi.format === 'percent' ? kpi.value + '%' : kpi.value}
            </div>
            ${kpi.comparison ? `
                <div class="kpi-comparison">
                    <i class="fas ${kpi.comparison > 0 ? 'fa-arrow-up trend-up' : 'fa-arrow-down trend-down'}"></i>
                    ${Math.abs(kpi.comparison)}% vs mês anterior
                </div>
            ` : ''}
        </div>
    `).join('');
    
    const insight = generateStrategicInsight();
    document.getElementById('strategicInsight').innerHTML = `
        <p><i class="fas fa-lightbulb"></i> ${insight}</p>
    `;
    
    if (isAuthorized) {
        document.getElementById('chartsContainer').classList.remove('hidden');
        renderCharts();
        renderAlerts();
        renderBirthdays();
        renderInactiveClients();
    } else {
        document.getElementById('chartsContainer').classList.add('hidden');
    }
}

function renderCharts() {
    Object.values(charts).forEach(chart => {
        if (chart) chart.destroy();
    });
    
    const ctx1 = document.getElementById('revenueChart').getContext('2d');
    charts.revenue = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
            datasets: [
                {
                    label: 'Receita',
                    data: simulatedData.faturamentoMensal,
                    backgroundColor: 'rgba(26, 59, 92, 0.8)'
                },
                {
                    label: 'Despesa',
                    data: simulatedData.faturamentoMensal.map(f => f * 0.7 + f * simulatedData.aliquotaImpostos),
                    backgroundColor: 'rgba(231, 76, 60, 0.8)'
                },
                {
                    label: 'Lucro',
                    data: simulatedData.faturamentoMensal.map(f => f * 0.3 - f * simulatedData.aliquotaImpostos),
                    backgroundColor: 'rgba(46, 204, 113, 0.8)'
                }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
    
    const ctx2 = document.getElementById('categoryChart').getContext('2d');
    const categorias = ['Feminino', 'Masculino', 'Infantil', 'Acessórios'];
    const vendasPorCategoria = categorias.map(cat => 
        simulatedData.vendas.filter(v => v.categoria === cat).length
    );
    
    charts.category = new Chart(ctx2, {
        type: 'pie',
        data: {
            labels: categorias,
            datasets: [{
                data: vendasPorCategoria,
                backgroundColor: ['#1a3b5c', '#2ecc71', '#f39c12', '#e74c3c']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
    
    const ctx3 = document.getElementById('abcChart').getContext('2d');
    const abcCounts = [
        simulatedData.produtos.filter(p => p.curva === 'A').length,
        simulatedData.produtos.filter(p => p.curva === 'B').length,
        simulatedData.produtos.filter(p => p.curva === 'C').length
    ];
    
    charts.abc = new Chart(ctx3, {
        type: 'doughnut',
        data: {
            labels: ['Curva A', 'Curva B', 'Curva C'],
            datasets: [{
                data: abcCounts,
                backgroundColor: ['#1a3b5c', '#2ecc71', '#e74c3c']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
    
    const ctx4 = document.getElementById('cashflowChart').getContext('2d');
    const dias = Array.from({length: 30}, (_, i) => i + 1);
    const fluxo = dias.map(() => Math.floor(Math.random() * 3000) + 1000);
    
    charts.cashflow = new Chart(ctx4, {
        type: 'line',
        data: {
            labels: dias,
            datasets: [{
                label: 'Fluxo de Caixa',
                data: fluxo,
                borderColor: '#1a3b5c',
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(26, 59, 92, 0.1)'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function renderAlerts() {
    const alerts = [];
    
    const encalhados = simulatedData.produtos.filter(p => p.status === 'encalhado');
    const capitalParado = encalhados.reduce((acc, p) => acc + p.valorEstoque, 0);
    if (encalhados.length > 0) {
        alerts.push(`⚠️ ${encalhados.length} produtos encalhados com R$ ${capitalParado.toFixed(2)} parados.`);
    }
    
    const ruptura = simulatedData.produtos.filter(p => p.status === 'ruptura').length;
    const riscoRuptura = simulatedData.produtos.filter(p => p.status === 'risco-ruptura').length;
    if (ruptura > 0) {
        alerts.push(`🔴 ${ruptura} produtos em RUPTURA TOTAL. Reabastecimento URGENTE.`);
    }
    if (riscoRuptura > 0) {
        alerts.push(`🟡 ${riscoRuptura} produtos com risco de ruptura.`);
    }
    
    const inativos = simulatedData.clientes.filter(c => c.status === 'inativo').length;
    const sumidos = simulatedData.clientes.filter(c => c.status === 'sumido').length;
    
    if (inativos > 0) {
        alerts.push(`📧 ${inativos} clientes inativos (60+ dias).`);
    }
    
    if (sumidos > 0) {
        alerts.push(`⚠️ ${sumidos} clientes sumidos (90+ dias).`);
    }
    
    const mesAtual = new Date().getMonth() + 1;
    const aniversariantes = simulatedData.clientes.filter(c => {
        const mes = new Date(c.aniversario).getMonth() + 1;
        return mes === mesAtual;
    }).length;
    
    if (aniversariantes > 0) {
        alerts.push(`🎂 ${aniversariantes} aniversariantes neste mês.`);
    }
    
    document.getElementById('alertsList').innerHTML = alerts.map(alert => 
        `<div style="padding: 10px; border-bottom: 1px solid var(--gray-200);">${alert}</div>`
    ).join('');
}

function renderBirthdays() {
    const mesAtual = new Date().getMonth() + 1;
    const aniversariantes = simulatedData.clientes
        .filter(c => {
            const mes = new Date(c.aniversario).getMonth() + 1;
            return mes === mesAtual;
        })
        .slice(0, 10);
    
    document.getElementById('birthdayBody').innerHTML = aniversariantes.map(c => {
        const temPromo = c.ultimaPromo ? 
            `<span class="status-badge status-promo">Enviada ${new Date(c.ultimaPromo).toLocaleDateString('pt-BR')}</span>` : 
            '-';
        
        return `
        <tr>
            <td>${c.nome}</td>
            <td>${new Date(c.aniversario).toLocaleDateString('pt-BR')}</td>
            <td>${new Date(c.ultimaCompra).toLocaleDateString('pt-BR')}</td>
            <td>${temPromo}</td>
            <td>
                <button class="btn-secondary btn-sm" onclick="sendBirthdayPromo('${c.nome}')">
                    Enviar Promoção
                </button>
            </td>
        </tr>
    `}).join('');
}

function renderInactiveClients() {
    const inativos = simulatedData.clientes
        .filter(c => c.status === 'inativo' || c.status === 'sumido')
        .map(c => {
            const dias = Math.floor((new Date() - new Date(c.ultimaCompra)) / (1000 * 60 * 60 * 24));
            return {...c, diasInativo: dias};
        })
        .sort((a, b) => b.diasInativo - a.diasInativo)
        .slice(0, 10);
    
    document.getElementById('inactiveBody').innerHTML = inativos.map(c => {
        const temPromo = c.ultimaPromo ? 
            `<span class="status-badge status-promo">Enviada ${new Date(c.ultimaPromo).toLocaleDateString('pt-BR')}</span>` : 
            '-';
        
        return `
        <tr>
            <td>${c.nome}</td>
            <td>${c.diasInativo} dias</td>
            <td>${new Date(c.ultimaCompra).toLocaleDateString('pt-BR')}</td>
            <td>R$ ${c.ticketMedio.toFixed(2)}</td>
            <td>${temPromo}</td>
        </tr>
    `}).join('');
}

function generateStrategicInsight() {
    const insights = [
        "A margem caiu 3% devido ao aumento de custo na categoria Feminino. Recomenda-se renegociar fornecedores.",
        "Clientes inativos aumentaram 15% neste trimestre. Sugerimos campanha de reativação.",
        "Produtos da curva A representam 70% do faturamento. Foque em manter estoque destes itens.",
        "Ticket médio está abaixo da meta. Considere estratégias de upsell.",
        "Estoque de produtos infantis está com baixo giro. Promoção de liquidar.",
        "Aniversariantes do mês: oportunidade de fidelização com campanha personalizada.",
        "Campanhas de email marketing têm convertido 15% dos clientes inativos.",
        "Clientes VIP representam 40% do faturamento. Crie um programa de benefícios."
    ];
    
    return insights[Math.floor(Math.random() * insights.length)];
}

// ==================== FUNÇÕES DE EMAIL MARKETING ====================
function initDefaultTemplates() {
    emailTemplates = [
        {
            id: 1,
            name: 'Felicitação de Aniversário',
            description: 'Envie um parabéns especial com desconto exclusivo',
            icon: 'fa-birthday-cake',
            subject: '🎂 {nome}, ganhe 20% de desconto no seu aniversário!',
            content: '<p>Olá {nome},</p><p>Parabéns pelo seu aniversário! 🎉</p><p>Para celebrar esta data especial, preparamos um presente para você: <strong>20% de desconto</strong> em toda a loja!</p><p>Use o cupom: <strong>FELIZANIVERSARIO</strong></p><p>Válido até {aniversario}.</p><p>Equipe FashionFlow</p>',
            variables: ['{nome}', '{aniversario}']
        },
        {
            id: 2,
            name: 'Reativação de Clientes',
            description: 'Traga clientes inativos de volta com oferta especial',
            icon: 'fa-user-clock',
            subject: '{nome}, sentimos sua falta! Oferta exclusiva para você',
            content: '<p>Olá {nome},</p><p>Faz {dias_inativo} dias que não vemos você por aqui 😢</p><p>Preparamos uma oferta especial para sua volta: <strong>15% de desconto</strong> em sua próxima compra!</p><p>Use o cupom: <strong>VOLTEI</strong></p><p>Equipe FashionFlow</p>',
            variables: ['{nome}', '{dias_inativo}', '{ultima_compra}']
        },
        {
            id: 3,
            name: 'Oferta VIP',
            description: 'Benefícios exclusivos para seus melhores clientes',
            icon: 'fa-crown',
            subject: '🌟 {nome}, benefício exclusivo para clientes VIP!',
            content: '<p>Olá {nome},</p><p>Você é um cliente especial para nós! Por isso, preparamos um <strong>benefício exclusivo</strong> para você:</p><p>✔️ Frete grátis em todas as compras<br>✔️ 10% de cashback<br>✔️ Acesso antecipado a lançamentos</p><p>Aproveite suas vantagens!</p><p>Equipe FashionFlow</p>',
            variables: ['{nome}', '{ticket_medio}']
        },
        {
            id: 4,
            name: 'Liquidação de Estoque',
            description: 'Promova produtos encalhados com descontos',
            icon: 'fa-tags',
            subject: '🔥 Últimas unidades! Até 50% OFF em selecionados',
            content: '<p>Olá {nome},</p><p>Separamos produtos incríveis com <strong>até 50% de desconto</strong> para você!</p><p>São peças selecionadas que estão saindo rápido. Corre garantir a sua!</p><p><a href="#">Conferir Promoções</a></p><p>Equipe FashionFlow</p>',
            variables: ['{nome}']
        }
    ];
    localStorage.setItem('emailTemplates', JSON.stringify(emailTemplates));
}

function renderEmailMarketing() {
    const templatesGrid = document.getElementById('templatesGrid');
    
    templatesGrid.innerHTML = emailTemplates.map(template => `
        <div class="template-card">
            <div class="template-icon">
                <i class="fas ${template.icon}"></i>
            </div>
            <div class="template-name">${template.name}</div>
            <div class="template-description">${template.description}</div>
            <div class="template-variables">
                <small>Variáveis disponíveis:</small><br>
                ${template.variables.map(v => `<span class="variable-tag">${v}</span>`).join(' ')}
            </div>
            <div style="display: flex; gap: 10px;">
                <button class="btn-secondary btn-sm" onclick="useTemplate(${template.id})">
                    <i class="fas fa-pen"></i> Usar
                </button>
                <button class="btn-secondary btn-sm" onclick="previewTemplate(${template.id})">
                    <i class="fas fa-eye"></i> Preview
                </button>
            </div>
        </div>
    `).join('');
    
    renderRecipientSelector();
    renderCampaignHistory();
}

function renderRecipientSelector() {
    if (!simulatedData) return;
    
    const counts = getAudienceCounts();
    
    const selector = document.getElementById('recipientSelector');
    selector.innerHTML = `
        <div class="recipient-card ${currentRecipientType === 'birthday' ? 'selected' : ''}" onclick="selectRecipient('birthday')">
            <h4>🎂 Aniversariantes</h4>
            <div class="recipient-count">${counts.birthday}</div>
            <small>Clientes que fazem aniversário este mês</small>
        </div>
        <div class="recipient-card ${currentRecipientType === 'inactive' ? 'selected' : ''}" onclick="selectRecipient('inactive')">
            <h4>⏰ Inativos</h4>
            <div class="recipient-count">${counts.inactive}</div>
            <small>Sem compras há +60 dias</small>
        </div>
        <div class="recipient-card ${currentRecipientType === 'vip' ? 'selected' : ''}" onclick="selectRecipient('vip')">
            <h4>👑 VIP</h4>
            <div class="recipient-count">${counts.vip}</div>
            <small>Clientes com alto ticket</small>
        </div>
        <div class="recipient-card ${currentRecipientType === 'encalhados' ? 'selected' : ''}" onclick="selectRecipient('encalhados')">
            <h4>📦 Encalhados</h4>
            <div class="recipient-count">${counts.encalhados}</div>
            <small>Produtos sem giro</small>
        </div>
        <div class="recipient-card ${currentRecipientType === 'todos' ? 'selected' : ''}" onclick="selectRecipient('todos')">
            <h4>📋 Todos</h4>
            <div class="recipient-count">${simulatedData.clientes.length}</div>
            <small>Todos os clientes</small>
        </div>
    `;
}

function getAudienceCounts() {
    if (!simulatedData) return { birthday: 0, inactive: 0, vip: 0, encalhados: 0 };
    
    const mesAtual = new Date().getMonth() + 1;
    
    const birthday = simulatedData.clientes.filter(c => {
        const mes = new Date(c.aniversario).getMonth() + 1;
        return mes === mesAtual;
    }).length;
    
    const inactive = simulatedData.clientes.filter(c => {
        const dias = Math.floor((new Date() - new Date(c.ultimaCompra)) / (1000 * 60 * 60 * 24));
        return dias > 60;
    }).length;
    
    const vip = simulatedData.clientes.filter(c => c.totalGasto > 5000).length;
    
    const encalhados = simulatedData.produtos.filter(p => p.status === 'encalhado').length;
    
    return { birthday, inactive, vip, encalhados };
}

function selectRecipient(type) {
    currentRecipientType = type;
    renderRecipientSelector();
    
    const customFilters = document.getElementById('customFilters');
    if (type === 'inactive' || type === 'vip' || type === 'encalhados') {
        customFilters.classList.remove('hidden');
    } else {
        customFilters.classList.add('hidden');
    }
}

function showNewCampaign() {
    document.getElementById('campaignForm').classList.remove('hidden');
    
    if (!quillEditor) {
        quillEditor = new Quill('#editor', {
            theme: 'snow',
            placeholder: 'Escreva seu e-mail aqui...',
            modules: {
                toolbar: [
                    ['bold', 'italic', 'underline'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    ['link'],
                    ['clean']
                ]
            }
        });
    }
    
    document.getElementById('campaignName').value = '';
    document.getElementById('emailSubject').value = '';
    quillEditor.setText('');
}

function cancelCampaign() {
    document.getElementById('campaignForm').classList.add('hidden');
}

function useTemplate(templateId) {
    const template = emailTemplates.find(t => t.id === templateId);
    if (template) {
        showNewCampaign();
        document.getElementById('campaignName').value = template.name;
        document.getElementById('emailSubject').value = template.subject;
        quillEditor.root.innerHTML = template.content;
    }
}

function previewTemplate(templateId) {
    const template = emailTemplates.find(t => t.id === templateId);
    if (template && simulatedData.clientes[0]) {
        const cliente = simulatedData.clientes[0];
        
        let previewContent = template.content
            .replace('{nome}', cliente.nome)
            .replace('{aniversario}', new Date(cliente.aniversario).toLocaleDateString('pt-BR'))
            .replace('{ultima_compra}', new Date(cliente.ultimaCompra).toLocaleDateString('pt-BR'))
            .replace('{dias_inativo}', '30')
            .replace('{ticket_medio}', `R$ ${cliente.ticketMedio.toFixed(2)}`)
            .replace('{cidade}', cliente.cidade);
        
        alert('Preview do e-mail:\n\nAssunto: ' + template.subject + '\n\n' + previewContent.replace(/<[^>]*>/g, ''));
    }
}

function insertVariable(variable) {
    if (quillEditor) {
        const range = quillEditor.getSelection();
        quillEditor.insertText(range ? range.index : 0, variable);
    }
}

function sendCampaign() {
    const name = document.getElementById('campaignName').value;
    const subject = document.getElementById('emailSubject').value;
    const content = quillEditor ? quillEditor.root.innerHTML : '';
    
    if (!name || !subject || !content) {
        alert('Preencha todos os campos!');
        return;
    }
    
    let recipients = [];
    let recipientType = '';
    
    if (currentRecipientType === 'birthday') {
        const mesAtual = new Date().getMonth() + 1;
        recipients = simulatedData.clientes.filter(c => {
            const mes = new Date(c.aniversario).getMonth() + 1;
            return mes === mesAtual;
        });
        recipientType = 'Aniversariantes';
    } else if (currentRecipientType === 'inactive') {
        const dias = parseInt(document.getElementById('inactiveDaysFilter')?.value || '60');
        recipients = simulatedData.clientes.filter(c => {
            const diasInativo = Math.floor((new Date() - new Date(c.ultimaCompra)) / (1000 * 60 * 60 * 24));
            return diasInativo > dias;
        });
        recipientType = 'Inativos';
    } else if (currentRecipientType === 'vip') {
        const valor = parseInt(document.getElementById('vipMinValue')?.value || '5000');
        recipients = simulatedData.clientes.filter(c => c.totalGasto > valor);
        recipientType = 'VIP';
    } else if (currentRecipientType === 'encalhados') {
        recipients = simulatedData.clientes;
        recipientType = 'Liquidação';
    } else {
        recipients = simulatedData.clientes;
        recipientType = 'Newsletter';
    }
    
    const recipientCount = recipients.length;
    
    const schedule = document.querySelector('input[name="schedule"]:checked').value;
    const scheduleDate = document.getElementById('scheduleDate').value;
    
    const campaign = {
        id: Date.now(),
        name,
        subject,
        recipientType,
        recipientCount,
        sentAt: schedule === 'now' ? new Date().toISOString() : scheduleDate,
        status: schedule === 'now' ? 'enviada' : 'agendada',
        stats: {
            opened: Math.floor(recipientCount * 0.4),
            clicked: Math.floor(recipientCount * 0.15),
            converted: Math.floor(recipientCount * 0.05)
        }
    };
    
    campaignHistory.unshift(campaign);
    localStorage.setItem('campaignHistory', JSON.stringify(campaignHistory));
    
    recipients.forEach(cliente => {
        const promo = {
            id: Date.now() + Math.random(),
            cliente: cliente.nome,
            campanha: name,
            tipo: recipientType,
            data: new Date().toISOString()
        };
        promoHistory.push(promo);
        
        const clienteIndex = simulatedData.clientes.findIndex(c => c.nome === cliente.nome);
        if (clienteIndex >= 0) {
            simulatedData.clientes[clienteIndex].ultimaPromo = new Date().toISOString();
            simulatedData.clientes[clienteIndex].tipoUltimaPromo = recipientType;
        }
    });
    
    localStorage.setItem('promoHistory', JSON.stringify(promoHistory));
    
    alert(`Campanha "${name}" ${schedule === 'now' ? 'enviada' : 'agendada'} para ${recipientCount} destinatários!`);
    
    cancelCampaign();
    renderCampaignHistory();
}

function testSend() {
    alert('E-mail de teste enviado para ' + currentUser.email);
}

function saveTemplate() {
    const name = document.getElementById('campaignName').value;
    const subject = document.getElementById('emailSubject').value;
    const content = quillEditor ? quillEditor.root.innerHTML : '';
    
    if (!name || !subject || !content) {
        alert('Preencha todos os campos!');
        return;
    }
    
    const newTemplate = {
        id: Date.now(),
        name,
        description: 'Template personalizado',
        icon: 'fa-envelope',
        subject,
        content,
        variables: ['{nome}', '{aniversario}', '{ultima_compra}']
    };
    
    emailTemplates.push(newTemplate);
    localStorage.setItem('emailTemplates', JSON.stringify(emailTemplates));
    
    alert('Template salvo com sucesso!');
    renderEmailMarketing();
}

function renderCampaignHistory() {
    const historyDiv = document.getElementById('campaignHistory');
    
    if (campaignHistory.length === 0) {
        historyDiv.innerHTML = '<p style="text-align: center; color: var(--gray-500);">Nenhuma campanha enviada ainda.</p>';
        return;
    }
    
    historyDiv.innerHTML = campaignHistory.map(campaign => `
        <div class="campaign-item">
            <div class="campaign-info">
                <h4>${campaign.name}</h4>
                <div class="campaign-meta">
                    <span>📅 ${new Date(campaign.sentAt).toLocaleDateString('pt-BR')}</span>
                    <span>👥 ${campaign.recipientCount} destinatários</span>
                    <span>📊 Status: ${campaign.status === 'enviada' ? '✅ Enviada' : '⏰ Agendada'}</span>
                </div>
            </div>
            ${campaign.stats ? `
                <div class="campaign-stats-small">
                    <div class="stat-item">
                        <div class="stat-value">${campaign.stats.opened}</div>
                        <div class="stat-label">Abertos</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${campaign.stats.clicked}</div>
                        <div class="stat-label">Cliques</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${campaign.stats.converted}</div>
                        <div class="stat-label">Conversões</div>
                    </div>
                </div>
            ` : ''}
        </div>
    `).join('');
}

// ==================== FUNÇÕES DE RANKINGS ====================
function atualizarRankings() {
    if (!simulatedData) return;
    
    const limit = parseInt(document.getElementById('rankingLimit').value) || 20;
    
    const vendasPorProduto = {};
    const quantidadePorProduto = {};
    const lucroPorProduto = {};
    const margemPorProduto = {};
    
    simulatedData.vendas.forEach(v => {
        if (v.status === 'concluida') {
            vendasPorProduto[v.produto] = (vendasPorProduto[v.produto] || 0) + v.total;
            quantidadePorProduto[v.produto] = (quantidadePorProduto[v.produto] || 0) + v.quantidade;
            lucroPorProduto[v.produto] = (lucroPorProduto[v.produto] || 0) + v.lucro;
            
            if (!margemPorProduto[v.produto]) {
                margemPorProduto[v.produto] = { soma: 0, count: 0 };
            }
            margemPorProduto[v.produto].soma += parseFloat(v.margemRealizada);
            margemPorProduto[v.produto].count++;
        }
    });
    
    Object.keys(margemPorProduto).forEach(prod => {
        margemPorProduto[prod] = margemPorProduto[prod].soma / margemPorProduto[prod].count;
    });
    
    const maisVendidos = Object.entries(vendasPorProduto)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([produto, valor]) => {
            const qtd = quantidadePorProduto[produto];
            const lucro = lucroPorProduto[produto];
            const margem = margemPorProduto[produto];
            return { produto, valor, qtd, lucro, margem };
        });
    
    const menosVendidos = Object.entries(quantidadePorProduto)
        .sort((a, b) => a[1] - b[1])
        .slice(0, limit)
        .map(([produto, qtd]) => {
            const valor = vendasPorProduto[produto];
            const lucro = lucroPorProduto[produto];
            const margem = margemPorProduto[produto];
            return { produto, qtd, valor, lucro, margem };
        });
    
    const maisLucrativos = Object.entries(lucroPorProduto)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([produto, lucro]) => {
            const valor = vendasPorProduto[produto];
            const qtd = quantidadePorProduto[produto];
            const margem = margemPorProduto[produto];
            return { produto, lucro, valor, qtd, margem };
        });
    
    const menosLucrativos = Object.entries(lucroPorProduto)
        .sort((a, b) => a[1] - b[1])
        .slice(0, limit)
        .map(([produto, lucro]) => {
            const valor = vendasPorProduto[produto];
            const qtd = quantidadePorProduto[produto];
            const margem = margemPorProduto[produto];
            return { produto, lucro, valor, qtd, margem };
        });
    
    document.getElementById('maisVendidosRanking').innerHTML = maisVendidos.map((item, i) => {
        const impacto = (item.valor / Object.values(vendasPorProduto).reduce((a, b) => a + b, 0) * 100).toFixed(1);
        return `
        <div class="ranking-item">
            <div class="ranking-position">${i+1}</div>
            <div class="ranking-info">
                <div class="ranking-name">${item.produto}</div>
                <div class="ranking-stats">
                    <div class="ranking-stat">
                        <span class="ranking-stat-label">Faturamento</span>
                        <span class="ranking-stat-value">R$ ${item.valor.toFixed(2)}</span>
                    </div>
                    <div class="ranking-stat">
                        <span class="ranking-stat-label">Unidades</span>
                        <span class="ranking-stat-value">${item.qtd}</span>
                    </div>
                    <div class="ranking-stat">
                        <span class="ranking-stat-label">Margem</span>
                        <span class="ranking-stat-value">${item.margem ? item.margem.toFixed(1) : '0'}%</span>
                    </div>
                </div>
                <span class="ranking-impact positive">${impacto}% do total</span>
            </div>
        </div>
    `}).join('');
    
    document.getElementById('menosVendidosRanking').innerHTML = menosVendidos.map((item, i) => {
        return `
        <div class="ranking-item">
            <div class="ranking-position">${i+1}</div>
            <div class="ranking-info">
                <div class="ranking-name">${item.produto}</div>
                <div class="ranking-stats">
                    <div class="ranking-stat">
                        <span class="ranking-stat-label">Unidades</span>
                        <span class="ranking-stat-value">${item.qtd}</span>
                    </div>
                    <div class="ranking-stat">
                        <span class="ranking-stat-label">Faturamento</span>
                        <span class="ranking-stat-value">R$ ${item.valor ? item.valor.toFixed(2) : '0'}</span>
                    </div>
                    <div class="ranking-stat">
                        <span class="ranking-stat-label">Lucro</span>
                        <span class="ranking-stat-value">R$ ${item.lucro ? item.lucro.toFixed(2) : '0'}</span>
                    </div>
                </div>
                <span class="ranking-impact negative">Baixo giro</span>
            </div>
        </div>
    `}).join('');
    
    document.getElementById('maisLucrativosRanking').innerHTML = maisLucrativos.map((item, i) => {
        return `
        <div class="ranking-item">
            <div class="ranking-position">${i+1}</div>
            <div class="ranking-info">
                <div class="ranking-name">${item.produto}</div>
                <div class="ranking-stats">
                    <div class="ranking-stat">
                        <span class="ranking-stat-label">Lucro</span>
                        <span class="ranking-stat-value">R$ ${item.lucro.toFixed(2)}</span>
                    </div>
                    <div class="ranking-stat">
                        <span class="ranking-stat-label">Margem</span>
                        <span class="ranking-stat-value">${item.margem ? item.margem.toFixed(1) : '0'}%</span>
                    </div>
                    <div class="ranking-stat">
                        <span class="ranking-stat-label">Faturamento</span>
                        <span class="ranking-stat-value">R$ ${item.valor.toFixed(2)}</span>
                    </div>
                </div>
                <span class="ranking-impact positive">Alta rentabilidade</span>
            </div>
        </div>
    `}).join('');
    
    document.getElementById('menosLucrativosRanking').innerHTML = menosLucrativos.map((item, i) => {
        return `
        <div class="ranking-item">
            <div class="ranking-position">${i+1}</div>
            <div class="ranking-info">
                <div class="ranking-name">${item.produto}</div>
                <div class="ranking-stats">
                    <div class="ranking-stat">
                        <span class="ranking-stat-label">Lucro</span>
                        <span class="ranking-stat-value">R$ ${item.lucro.toFixed(2)}</span>
                    </div>
                    <div class="ranking-stat">
                        <span class="ranking-stat-label">Margem</span>
                        <span class="ranking-stat-value">${item.margem ? item.margem.toFixed(1) : '0'}%</span>
                    </div>
                    <div class="ranking-stat">
                        <span class="ranking-stat-label">Faturamento</span>
                        <span class="ranking-stat-value">R$ ${item.valor.toFixed(2)}</span>
                    </div>
                </div>
                <span class="ranking-impact negative">Baixa rentabilidade</span>
            </div>
        </div>
    `}).join('');
    
    const totalFaturamento = Object.values(vendasPorProduto).reduce((a, b) => a + b, 0);
    const totalLucro = Object.values(lucroPorProduto).reduce((a, b) => a + b, 0);
    
    const top10Faturamento = maisVendidos.slice(0, 10).reduce((acc, item) => acc + item.valor, 0);
    const top10Lucro = maisLucrativos.slice(0, 10).reduce((acc, item) => acc + item.lucro, 0);
    
    document.getElementById('rankingSummary').innerHTML = `
        <div><strong>📈 Top 20 representam:</strong> ${(top10Faturamento / totalFaturamento * 100).toFixed(1)}% do faturamento</div>
        <div><strong>💰 Top 20 lucrativos:</strong> ${(top10Lucro / totalLucro * 100).toFixed(1)}% do lucro</div>
        <div><strong>📊 Ticket médio:</strong> R$ ${(totalFaturamento / simulatedData.vendas.length).toFixed(2)}</div>
        <div><strong>🎯 Margem média:</strong> ${(totalLucro / totalFaturamento * 100).toFixed(1)}%</div>
    `;
}

function exportarRankings() {
    const limit = document.getElementById('rankingLimit').value;
    alert(`Rankings exportados com sucesso! (Top ${limit} itens) - Simulação`);
}

// ==================== FUNÇÕES DE RELATÓRIOS ====================
function gerarRelatorio() {
    const tipo = document.getElementById('tipoRelatorio').value;
    let conteudo = '';
    
    if (tipo === 'clientes') {
        const clientesVip = simulatedData.clientes
            .filter(c => c.status === 'vip' && c.totalGasto > 5000)
            .sort((a, b) => b.totalGasto - a.totalGasto)
            .slice(0, 10);
        
        conteudo = '<h4>🏆 Clientes VIP</h4>';
        clientesVip.forEach((c, i) => {
            conteudo += `<p>${i+1}. ${c.nome} - R$ ${c.totalGasto.toFixed(2)} (${c.frequencia} compras)</p>`;
        });
        
        const top10 = simulatedData.clientes
            .sort((a, b) => b.totalGasto - a.totalGasto)
            .slice(0, 10);
        
        let topHtml = '';
        top10.forEach(c => {
            topHtml += `<p>• ${c.nome}: R$ ${c.totalGasto.toFixed(2)} (${c.frequencia} compras)</p>`;
        });
        document.getElementById('topClientes').innerHTML = topHtml;
        
    } else if (tipo === 'vendas') {
        const totalVendas = simulatedData.vendas.length;
        const totalValor = simulatedData.vendas.reduce((acc, v) => acc + v.total, 0);
        const ticketMedio = totalVendas > 0 ? (totalValor / totalVendas).toFixed(2) : 0;
        
        conteudo = '<h4>📊 Análise de Vendas</h4>';
        conteudo += `<p>Total de Vendas: ${totalVendas}</p>`;
        conteudo += `<p>Volume Financeiro: R$ ${totalValor.toFixed(2)}</p>`;
        conteudo += `<p>Ticket Médio: R$ ${ticketMedio}</p>`;
        
    } else if (tipo === 'estoque') {
        const encalhados = simulatedData.produtos.filter(p => p.status === 'encalhado').length;
        const ruptura = simulatedData.produtos.filter(p => p.status === 'ruptura').length;
        const valorEstoque = simulatedData.produtos.reduce((acc, p) => acc + p.valorEstoque, 0);
        
        conteudo = '<h4>📦 Relatório de Estoque</h4>';
        conteudo += `<p>Valor Total em Estoque: R$ ${valorEstoque.toFixed(2)}</p>`;
        conteudo += `<p>Produtos Encalhados: ${encalhados}</p>`;
        conteudo += `<p>Produtos em Ruptura: ${ruptura}</p>`;
        
    } else if (tipo === 'financeiro') {
        const projecao = simulatedData.faturamentoMensal[simulatedData.faturamentoMensal.length - 1] * 1.1;
        const lucroProjetado = projecao * 0.35;
        
        conteudo = '<h4>💰 Projeção Financeira</h4>';
        conteudo += `<p>Faturamento Projetado: R$ ${projecao.toFixed(2)}</p>`;
        conteudo += `<p>Lucro Projetado: R$ ${lucroProjetado.toFixed(2)}</p>`;
        
    } else if (tipo === 'marketing') {
        const totalCampanhas = campaignHistory.length;
        const totalEnvios = campaignHistory.reduce((acc, c) => acc + c.recipientCount, 0);
        const totalAbertos = campaignHistory.reduce((acc, c) => acc + (c.stats?.opened || 0), 0);
        const taxaAbertura = totalEnvios > 0 ? ((totalAbertos / totalEnvios) * 100).toFixed(1) : 0;
        const totalPromos = promoHistory.length;
        
        conteudo = '<h4>📧 Performance de Marketing</h4>';
        conteudo += `<p>Total de Campanhas: ${totalCampanhas}</p>`;
        conteudo += `<p>Total de Envios: ${totalEnvios}</p>`;
        conteudo += `<p>Total de Promoções: ${totalPromos}</p>`;
        conteudo += `<p>Taxa de Abertura: ${taxaAbertura}%</p>`;
    }
    
    document.getElementById('relatorioConteudo').innerHTML = conteudo;
}

function exportarRelatorio() {
    alert('Relatório exportado com sucesso! (Simulação)');
}

// ==================== FUNÇÕES DE PROMOÇÕES ====================
function sendBirthdayPromo(nome) {
    const cliente = simulatedData.clientes.find(c => c.nome === nome);
    
    const promo = {
        id: Date.now(),
        cliente: nome,
        campanha: 'Felicitação de Aniversário',
        tipo: 'Aniversariante',
        data: new Date().toISOString()
    };
    
    promoHistory.push(promo);
    localStorage.setItem('promoHistory', JSON.stringify(promoHistory));
    
    const clienteIndex = simulatedData.clientes.findIndex(c => c.nome === nome);
    if (clienteIndex >= 0) {
        simulatedData.clientes[clienteIndex].ultimaPromo = new Date().toISOString();
        simulatedData.clientes[clienteIndex].tipoUltimaPromo = 'Aniversariante';
    }
    
    alert(`🎂 Promoção de aniversário enviada para ${nome}!`);
    
    if (!document.getElementById('clientesContent').classList.contains('hidden')) {
        renderClients();
    }
}

function sendPromo(nome) {
    const cliente = simulatedData.clientes.find(c => c.nome === nome);
    
    const promo = {
        id: Date.now(),
        cliente: nome,
        campanha: 'Oferta Personalizada',
        tipo: 'Promoção Manual',
        data: new Date().toISOString()
    };
    
    promoHistory.push(promo);
    localStorage.setItem('promoHistory', JSON.stringify(promoHistory));
    
    const clienteIndex = simulatedData.clientes.findIndex(c => c.nome === nome);
    if (clienteIndex >= 0) {
        simulatedData.clientes[clienteIndex].ultimaPromo = new Date().toISOString();
        simulatedData.clientes[clienteIndex].tipoUltimaPromo = 'Promoção Manual';
    }
    
    alert(`📧 Oferta especial enviada para ${nome}!`);
    
    if (!document.getElementById('clientesContent').classList.contains('hidden')) {
        renderClients();
    }
}

// ==================== OWNER FUNCTIONS ====================
function grantCredits() {
    const email = document.getElementById('creditEmail').value;
    const days = parseInt(document.getElementById('creditDays').value);
    
    const userIndex = users.findIndex(u => u.email === email);
    if (userIndex >= 0) {
        users[userIndex].credits = (users[userIndex].credits || 0) + days;
        localStorage.setItem('users', JSON.stringify(users));
        alert(`Créditos concedidos! ${days} dias adicionados para ${email}`);
        document.getElementById('creditEmail').value = '';
    } else {
        alert('Usuário não encontrado');
    }
}