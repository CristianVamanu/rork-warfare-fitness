import { useEffect, useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DataPersistenceConfig {
  key: string;
  defaultValue?: any;
  autoLoad?: boolean;
  autoSave?: boolean;
  validateData?: (data: any) => boolean;
}

export function useDataPersistence<T>(config: DataPersistenceConfig) {
  const { key, defaultValue, autoLoad = true, autoSave = true, validateData } = config;
  const [data, setData] = useState<T | undefined>(defaultValue);
  const [isLoading, setIsLoading] = useState<boolean>(autoLoad);
  const [error, setError] = useState<Error | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const stored = await AsyncStorage.getItem(key);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        
        if (validateData && !validateData(parsed)) {
          console.warn(`[DataPersistence] Invalid data for key: ${key}`);
          setData(defaultValue);
          return;
        }
        
        setData(parsed);
        console.log(`[DataPersistence] Loaded data for key: ${key}`);
      } else {
        setData(defaultValue);
      }
    } catch (err) {
      console.error(`[DataPersistence] Failed to load data for key: ${key}`, err);
      setError(err as Error);
      setData(defaultValue);
    } finally {
      setIsLoading(false);
    }
  }, [key, defaultValue, validateData]);

  const saveData = useCallback(async (newData: T) => {
    try {
      if (validateData && !validateData(newData)) {
        console.error(`[DataPersistence] Validation failed for key: ${key}`);
        return false;
      }

      await AsyncStorage.setItem(key, JSON.stringify(newData));
      setData(newData);
      console.log(`[DataPersistence] Saved data for key: ${key}`);
      return true;
    } catch (err) {
      console.error(`[DataPersistence] Failed to save data for key: ${key}`, err);
      setError(err as Error);
      return false;
    }
  }, [key, validateData]);

  const clearData = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(key);
      setData(defaultValue);
      console.log(`[DataPersistence] Cleared data for key: ${key}`);
      return true;
    } catch (err) {
      console.error(`[DataPersistence] Failed to clear data for key: ${key}`, err);
      setError(err as Error);
      return false;
    }
  }, [key, defaultValue]);

  useEffect(() => {
    if (autoLoad) {
      void loadData();
    }
  }, [autoLoad, loadData]);

  useEffect(() => {
    if (autoSave && data !== undefined && !isLoading) {
      void AsyncStorage.setItem(key, JSON.stringify(data));
    }
  }, [autoSave, data, key, isLoading]);

  return {
    data,
    isLoading,
    error,
    loadData,
    saveData,
    clearData,
    setData,
  };
}
