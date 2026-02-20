// functions/simulationEngine.js
const admin = require('firebase-admin');

// Parâmetros da Loja (100m², R$ 50k/mês)
const TARGET_REVENUE = 50000;
const AVG_TICKET = 85.00; // Ticket médio estimado
const FIXED_COSTS = 12000; // Aluguel, luz, funcionários
const AVG_MARKUP = 1.8; // Preço de venda / Preço de custo

exports.generateDailySales = async () => {
    const db = admin.firestore();
    const today = new Date().toISOString().split('T')[0];
    
    // Calcula quantas vendas são necessárias hoje para bater a meta mensal
    const dailyTarget = TARGET_REVENUE / 30;
    const numberOfSales = Math.floor(dailyTarget / AVG_TICKET) + Math.floor(Math.random() * 5);

    let dailyRevenue = 0;
    let dailyCost = 0;

    for (let i = 0; i < numberOfSales; i++) {
        const saleAmount = AVG_TICKET * (0.8 + Math.random() * 0.4); // Variação do ticket
        const costPrice = saleAmount / AVG_MARKUP;
        
        const sale = {
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            total: parseFloat(saleAmount.toFixed(2)),
            cost: parseFloat(costPrice.toFixed(2)),
            items: 2, // Simulação simples
            status: 'completed'
        };

        await db.collection('sales').add(sale);
        dailyRevenue += saleAmount;
        dailyCost += costPrice;
    }

    // Atualiza KPIs Globais
    const kpiRef = db.collection('reports').doc('monthly_stats');
    await kpiRef.set({
        revenue: admin.firestore.FieldValue.increment(dailyRevenue),
        cmv: admin.firestore.FieldValue.increment(dailyCost),
        opex: FIXED_COSTS / 30,
        netProfit: admin.firestore.FieldValue.increment(dailyRevenue - dailyCost - (FIXED_COSTS/30)),
        lastUpdate: today
    }, { merge: true });
};