// src/services/blingService.js
export const fetchBlingData = async () => {
    // Simula o delay de uma rede
    await new Promise(resolve => setTimeout(resolve, 800));

    return {
        retorno: {
            produtos: [
                { codigo: '001', descricao: 'Kit Organização Casa', estoque: 45, preco: 129.90 },
                { codigo: '002', descricao: 'Luminária LED Moderna', estoque: 12, preco: 89.00 },
                { codigo: '003', descricao: 'Jogo de Panelas Premium', estoque: 5, preco: 450.00 },
            ]
        }
    };
};