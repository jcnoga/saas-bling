// src/components/Dashboard.js
import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { db } from '../firebaseConfig';
import { collection, query, onSnapshot } from 'firebase/firestore';

const Dashboard = () => {
    const [stats, setStats] = useState({ revenue: 0, ticket: 0, profit: 0 });

    useEffect(() => {
        const q = query(collection(db, "reports"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const data = querySnapshot.docs.map(doc => doc.data());
            // Lógica para consolidar estados
            if(data[0]) setStats(data[0]);
        });
        return () => unsubscribe();
    }, []);

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-bold mb-6">Gestão Loja Física - 100m²</h1>
            
            {/* Cards de KPI */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-4 rounded shadow">
                    <p className="text-gray-500">Faturamento Mensal</p>
                    <h2 className="text-2xl font-bold text-blue-600">R$ {stats.revenue?.toLocaleString()}</h2>
                </div>
                <div className="bg-white p-4 rounded shadow">
                    <p className="text-gray-500">Lucro Líquido</p>
                    <h2 className="text-2xl font-bold text-green-600">R$ {stats.netProfit?.toLocaleString()}</h2>
                </div>
                {/* Outros KPIs... */}
            </div>

            {/* Gráfico de Vendas */}
            <div className="bg-white p-6 rounded shadow h-80">
                <h3 className="mb-4 font-semibold">Fluxo de Caixa Diário</h3>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mockChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Line type="monotone" dataKey="vendas" stroke="#3b82f6" strokeWidth={2} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};