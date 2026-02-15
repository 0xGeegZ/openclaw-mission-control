/**
 * Phase 2.1 AdminContext
 * State management for customer, container, and metrics data
 */

'use client';

import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import {
  AdminDashboardState,
  Customer,
  Container,
  Metrics,
  MetricsAggregated,
} from '../types';

type Action =
  | { type: 'SET_CUSTOMERS'; payload: Customer[] }
  | { type: 'SET_CONTAINERS'; payload: Container[] }
  | { type: 'SET_METRICS'; payload: Metrics[] }
  | { type: 'SET_AGGREGATED_METRICS'; payload: MetricsAggregated[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'ADD_CUSTOMER'; payload: Customer }
  | { type: 'UPDATE_CUSTOMER'; payload: Customer }
  | { type: 'DELETE_CUSTOMER'; payload: string }
  | { type: 'ADD_CONTAINER'; payload: Container }
  | { type: 'UPDATE_CONTAINER'; payload: Container }
  | { type: 'DELETE_CONTAINER'; payload: string }
  | { type: 'RESET' };

interface AdminContextType {
  state: AdminDashboardState;
  dispatch: React.Dispatch<Action>;
  // Convenience methods
  setCustomers: (customers: Customer[]) => void;
  setContainers: (containers: Container[]) => void;
  setMetrics: (metrics: Metrics[]) => void;
  setAggregatedMetrics: (metrics: MetricsAggregated[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  addCustomer: (customer: Customer) => void;
  updateCustomer: (customer: Customer) => void;
  deleteCustomer: (customerId: string) => void;
  addContainer: (container: Container) => void;
  updateContainer: (container: Container) => void;
  deleteContainer: (containerId: string) => void;
  reset: () => void;
}

const initialState: AdminDashboardState = {
  customers: [],
  containers: [],
  metrics: [],
  aggregatedMetrics: [],
  loading: false,
  error: null,
  lastUpdated: null,
};

const adminReducer = (state: AdminDashboardState, action: Action): AdminDashboardState => {
  switch (action.type) {
    case 'SET_CUSTOMERS':
      return { ...state, customers: action.payload, lastUpdated: new Date() };
    case 'SET_CONTAINERS':
      return { ...state, containers: action.payload, lastUpdated: new Date() };
    case 'SET_METRICS':
      return { ...state, metrics: action.payload, lastUpdated: new Date() };
    case 'SET_AGGREGATED_METRICS':
      return { ...state, aggregatedMetrics: action.payload, lastUpdated: new Date() };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'ADD_CUSTOMER':
      return {
        ...state,
        customers: [...state.customers, action.payload],
        lastUpdated: new Date(),
      };
    case 'UPDATE_CUSTOMER':
      return {
        ...state,
        customers: state.customers.map(c => (c.id === action.payload.id ? action.payload : c)),
        lastUpdated: new Date(),
      };
    case 'DELETE_CUSTOMER':
      return {
        ...state,
        customers: state.customers.filter(c => c.id !== action.payload),
        lastUpdated: new Date(),
      };
    case 'ADD_CONTAINER':
      return {
        ...state,
        containers: [...state.containers, action.payload],
        lastUpdated: new Date(),
      };
    case 'UPDATE_CONTAINER':
      return {
        ...state,
        containers: state.containers.map(c =>
          c.id === action.payload.id ? action.payload : c
        ),
        lastUpdated: new Date(),
      };
    case 'DELETE_CONTAINER':
      return {
        ...state,
        containers: state.containers.filter(c => c.id !== action.payload),
        lastUpdated: new Date(),
      };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
};

const AdminContext = createContext<AdminContextType | undefined>(undefined);

interface AdminProviderProps {
  children: ReactNode;
}

export const AdminProvider: React.FC<AdminProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(adminReducer, initialState);

  const setCustomers = useCallback((customers: Customer[]) => {
    dispatch({ type: 'SET_CUSTOMERS', payload: customers });
  }, []);

  const setContainers = useCallback((containers: Container[]) => {
    dispatch({ type: 'SET_CONTAINERS', payload: containers });
  }, []);

  const setMetrics = useCallback((metrics: Metrics[]) => {
    dispatch({ type: 'SET_METRICS', payload: metrics });
  }, []);

  const setAggregatedMetrics = useCallback((metrics: MetricsAggregated[]) => {
    dispatch({ type: 'SET_AGGREGATED_METRICS', payload: metrics });
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  }, []);

  const addCustomer = useCallback((customer: Customer) => {
    dispatch({ type: 'ADD_CUSTOMER', payload: customer });
  }, []);

  const updateCustomer = useCallback((customer: Customer) => {
    dispatch({ type: 'UPDATE_CUSTOMER', payload: customer });
  }, []);

  const deleteCustomer = useCallback((customerId: string) => {
    dispatch({ type: 'DELETE_CUSTOMER', payload: customerId });
  }, []);

  const addContainer = useCallback((container: Container) => {
    dispatch({ type: 'ADD_CONTAINER', payload: container });
  }, []);

  const updateContainer = useCallback((container: Container) => {
    dispatch({ type: 'UPDATE_CONTAINER', payload: container });
  }, []);

  const deleteContainer = useCallback((containerId: string) => {
    dispatch({ type: 'DELETE_CONTAINER', payload: containerId });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const value: AdminContextType = {
    state,
    dispatch,
    setCustomers,
    setContainers,
    setMetrics,
    setAggregatedMetrics,
    setLoading,
    setError,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    addContainer,
    updateContainer,
    deleteContainer,
    reset,
  };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};

/**
 * Hook to use AdminContext
 * @throws Error if used outside of AdminProvider
 */
export const useAdmin = (): AdminContextType => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within AdminProvider');
  }
  return context;
};
