import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Monitor, 
  FileText, 
  Target, 
  Play,
  TrendingUp,
  AlertTriangle,
  Activity,
  Users
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

import api from '../utils/api';
import LoadingSpinner from '../components/LoadingSpinner';

const DashboardPage = () => {
  const { data: overview, isLoading } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => api.get('/analytics/overview').then(res => res.data.overview)
  });

  // Mock data for charts
  const playbackData = [
    { name: 'Mon', plays: 120, duration: 480 },
    { name: 'Tue', plays: 145, duration: 520 },
    { name: 'Wed', plays: 110, duration: 430 },
    { name: 'Thu', plays: 135, duration: 490 },
    { name: 'Fri', plays: 160, duration: 580 },
    { name: 'Sat', plays: 95, duration: 320 },
    { name: 'Sun', plays: 85, duration: 290 }
  ];

  const deviceStatusData = [
    { name: 'Online', count: overview?.devices?.online || 0 },
    { name: 'Offline', count: overview?.devices?.offline || 0 },
    { name: 'Error', count: overview?.devices?.error || 0 }
  ];

  if (isLoading) {
    return <LoadingSpinner className="h-64" />;
  }

  const stats = [
    {
      name: 'Total Devices',
      value: overview?.devices?.total || 0,
      icon: Monitor,
      change: '+12%',
      changeType: 'positive'
    },
    {
      name: 'Content Items',
      value: overview?.content?.total || 0,
      icon: FileText,
      change: '+8%',
      changeType: 'positive'
    },
    {
      name: 'Active Campaigns',
      value: overview?.campaigns?.active || 0,
      icon: Target,
      change: '+3%',
      changeType: 'positive'
    },
    {
      name: 'Total Playlists',
      value: overview?.playlists?.total || 0,
      icon: Play,
      change: '+5%',
      changeType: 'positive'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.name} className="card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                  <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className="flex items-center space-x-2">
                  <Icon className="h-8 w-8 text-primary-600" />
                </div>
              </div>
              <div className="mt-4 flex items-center">
                <span className={`text-sm font-medium ${
                  stat.changeType === 'positive' ? 'text-success-600' : 'text-error-600'
                }`}>
                  {stat.change}
                </span>
                <span className="text-sm text-gray-500 ml-2">vs last month</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Playback Analytics */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Playback Analytics</h3>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <TrendingUp className="h-4 w-4" />
              <span>Last 7 days</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={playbackData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="name" 
                axisLine={false}
                tickLine={false}
                style={{ fontSize: '12px', fill: '#6b7280' }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                style={{ fontSize: '12px', fill: '#6b7280' }}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="plays" 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, fill: '#3b82f6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Device Status */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Device Status</h3>
            <Activity className="h-5 w-5 text-gray-400" />
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={deviceStatusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="name" 
                axisLine={false}
                tickLine={false}
                style={{ fontSize: '12px', fill: '#6b7280' }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                style={{ fontSize: '12px', fill: '#6b7280' }}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
              <Bar 
                dataKey="count" 
                fill={(entry, index) => {
                  const colors = ['#22c55e', '#6b7280', '#ef4444'];
                  return colors[index] || '#3b82f6';
                }}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Online Devices */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Online Devices</h3>
              <p className="text-3xl font-bold text-success-600 mt-2">
                {overview?.devices?.online || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-success-100 rounded-full flex items-center justify-center">
              <Monitor className="h-6 w-6 text-success-600" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Status</span>
              <span className="text-success-600 font-medium">Healthy</span>
            </div>
          </div>
        </div>

        {/* Today's Plays */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Today's Plays</h3>
              <p className="text-3xl font-bold text-primary-600 mt-2">
                {overview?.playback?.today?.plays || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
              <Play className="h-6 w-6 text-primary-600" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Duration</span>
              <span className="text-primary-600 font-medium">
                {Math.round((overview?.playback?.today?.duration || 0) / 60)}min
              </span>
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">System Alerts</h3>
              <p className="text-3xl font-bold text-warning-600 mt-2">
                {overview?.devices?.offline || 0}
              </p>
            </div>
            <div className="w-12 h-12 bg-warning-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-warning-600" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Offline devices</span>
              <span className="text-warning-600 font-medium">
                Needs attention
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
          <Users className="h-5 w-5 text-gray-400" />
        </div>
        
        <div className="space-y-4">
          {[
            {
              action: 'Device "Store Front Display" came online',
              time: '5 minutes ago',
              type: 'success'
            },
            {
              action: 'Campaign "Summer Sale" activated on 3 devices',
              time: '1 hour ago',
              type: 'info'
            },
            {
              action: 'Device "Lobby Screen" went offline',
              time: '2 hours ago',
              type: 'warning'
            },
            {
              action: 'New content "Product Demo" uploaded',
              time: '3 hours ago',
              type: 'info'
            }
          ].map((activity, index) => (
            <div key={index} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
              <div className={`w-2 h-2 rounded-full ${
                activity.type === 'success' ? 'bg-success-500' :
                activity.type === 'warning' ? 'bg-warning-500' : 'bg-primary-500'
              }`}></div>
              <div className="flex-1">
                <p className="text-sm text-gray-900">{activity.action}</p>
                <p className="text-xs text-gray-500">{activity.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;