import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ChallengeStatus = 'incoming' | 'active' | 'ended';

export interface WeightClass {
  className: string;
  targetValue: number;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  mediaUrl?: string;
  metricType: string;
  unit: string;
  weightClasses: WeightClass[];
  rewardLink: string;
  verificationType: 'manual' | 'video';
  startDate: string;
  endDate: string;
  createdBy: string;
  createdAt: string;
}

export type SubmissionReviewStatus = 'pending' | 'approved' | 'rejected';

export interface ChallengeSubmission {
  id: string;
  userId: string;
  challengeId: string;
  weightClass: string;
  resultValue: number;
  proofUrl?: string;
  isVerified: boolean;
  rewardUnlocked: boolean;
  reviewStatus: SubmissionReviewStatus;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  timestamp: string;
}

const STORAGE_KEYS = {
  CHALLENGES: 'warfare_challenges',
  SUBMISSIONS: 'warfare_challenge_submissions',
};

export const [ChallengesProvider, useChallenges] = createContextHook(() => {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [submissions, setSubmissions] = useState<ChallengeSubmission[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('[Challenges] Loading persisted data...');

        const storedChallenges = await AsyncStorage.getItem(STORAGE_KEYS.CHALLENGES);
        if (storedChallenges) {
          try {
            setChallenges(JSON.parse(storedChallenges));
            console.log('[Challenges] Loaded challenges from storage');
          } catch (err) {
            console.error('[Challenges] Failed to parse challenges:', err);
          }
        }

        const storedSubmissions = await AsyncStorage.getItem(STORAGE_KEYS.SUBMISSIONS);
        if (storedSubmissions) {
          try {
            setSubmissions(JSON.parse(storedSubmissions));
            console.log('[Challenges] Loaded submissions from storage');
          } catch (err) {
            console.error('[Challenges] Failed to parse submissions:', err);
          }
        }

        console.log('[Challenges] Data loaded successfully');
      } catch (error) {
        console.error('[Challenges] Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    void loadData();
  }, []);

  const getChallengeStatus = useCallback((challenge: Challenge): ChallengeStatus => {
    const now = new Date();
    const startDate = new Date(challenge.startDate);
    const endDate = new Date(challenge.endDate);

    if (now < startDate) return 'incoming';
    if (now > endDate) return 'ended';
    return 'active';
  }, []);

  const createChallenge = useCallback(async (data: Omit<Challenge, 'id' | 'createdBy' | 'createdAt'>) => {
    const newChallenge: Challenge = {
      ...data,
      id: 'c-' + Date.now().toString(),
      createdBy: 'admin',
      createdAt: new Date().toISOString(),
    };

    const updated = [...(challenges || []), newChallenge];
    setChallenges(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.CHALLENGES, JSON.stringify(updated));
    console.log('[Challenges] Created challenge:', newChallenge.id);
    return newChallenge;
  }, [challenges]);

  const updateChallenge = useCallback(async (challengeId: string, updates: Partial<Challenge>) => {
    const updated = (challenges || []).map(c => c.id === challengeId ? { ...c, ...updates } : c);
    setChallenges(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.CHALLENGES, JSON.stringify(updated));
    console.log('[Challenges] Updated challenge:', challengeId);
  }, [challenges]);

  const deleteChallenge = useCallback(async (challengeId: string) => {
    const updated = (challenges || []).filter(c => c.id !== challengeId);
    setChallenges(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.CHALLENGES, JSON.stringify(updated));
    console.log('[Challenges] Deleted challenge:', challengeId);
  }, [challenges]);

  const submitChallenge = useCallback(async (
    userId: string,
    challengeId: string,
    weightClass: string,
    resultValue: number,
    proofUrl?: string
  ) => {
    const challenge = (challenges || []).find(c => c.id === challengeId);
    if (!challenge) {
      console.error('[Challenges] Challenge not found:', challengeId);
      return null;
    }

    const selectedWeightClass = challenge.weightClasses.find(wc => wc.className === weightClass);
    if (!selectedWeightClass) {
      console.error('[Challenges] Weight class not found:', weightClass);
      return null;
    }

    const rewardUnlocked = resultValue >= selectedWeightClass.targetValue;

    const newSubmission: ChallengeSubmission = {
      id: 's-' + Date.now().toString(),
      userId,
      challengeId,
      weightClass,
      resultValue,
      proofUrl,
      isVerified: false,
      rewardUnlocked: false,
      reviewStatus: 'pending',
      timestamp: new Date().toISOString(),
    };

    const updated = [...(submissions || []), newSubmission];
    setSubmissions(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(updated));
    console.log('[Challenges] Submitted challenge:', newSubmission.id, 'Reward unlocked:', rewardUnlocked);
    return newSubmission;
  }, [challenges, submissions]);

  const getUserSubmissions = useCallback((userId: string, challengeId?: string) => {
    let filtered = (submissions || []).filter(s => s.userId === userId);
    if (challengeId) {
      filtered = filtered.filter(s => s.challengeId === challengeId);
    }
    return filtered;
  }, [submissions]);

  const getChallengesByStatus = useCallback((status: ChallengeStatus) => {
    return (challenges || []).filter(c => getChallengeStatus(c) === status);
  }, [challenges, getChallengeStatus]);

  const getActiveChallenges = useCallback(() => {
    return getChallengesByStatus('active');
  }, [getChallengesByStatus]);

  const getIncomingChallenges = useCallback(() => {
    return getChallengesByStatus('incoming');
  }, [getChallengesByStatus]);

  const getEndedChallenges = useCallback(() => {
    return getChallengesByStatus('ended');
  }, [getChallengesByStatus]);

  const getChallengeById = useCallback((challengeId: string) => {
    return (challenges || []).find(c => c.id === challengeId);
  }, [challenges]);

  const hasUserSubmitted = useCallback((userId: string, challengeId: string) => {
    return (submissions || []).some(s => s.userId === userId && s.challengeId === challengeId);
  }, [submissions]);

  const getUserSuccessfulSubmissions = useCallback((userId: string) => {
    return (submissions || []).filter(s => s.userId === userId && s.rewardUnlocked);
  }, [submissions]);

  const approveSubmission = useCallback(async (submissionId: string, adminId: string) => {
    const submission = (submissions || []).find(s => s.id === submissionId);
    if (!submission) {
      console.error('[Challenges] Submission not found:', submissionId);
      return false;
    }

    const challenge = (challenges || []).find(c => c.id === submission.challengeId);
    if (!challenge) {
      console.error('[Challenges] Challenge not found:', submission.challengeId);
      return false;
    }

    const selectedWeightClass = challenge.weightClasses.find(wc => wc.className === submission.weightClass);
    if (!selectedWeightClass) {
      console.error('[Challenges] Weight class not found:', submission.weightClass);
      return false;
    }

    const rewardUnlocked = submission.resultValue >= selectedWeightClass.targetValue;

    const updated = (submissions || []).map(s => 
      s.id === submissionId 
        ? {
            ...s,
            reviewStatus: 'approved' as SubmissionReviewStatus,
            isVerified: true,
            rewardUnlocked,
            reviewedBy: adminId,
            reviewedAt: new Date().toISOString(),
          }
        : s
    );
    setSubmissions(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(updated));
    console.log('[Challenges] Submission approved:', submissionId, 'Reward unlocked:', rewardUnlocked);
    return true;
  }, [challenges, submissions]);

  const rejectSubmission = useCallback(async (submissionId: string, adminId: string, rejectionReason: string) => {
    const updated = (submissions || []).map(s => 
      s.id === submissionId 
        ? {
            ...s,
            reviewStatus: 'rejected' as SubmissionReviewStatus,
            isVerified: false,
            rewardUnlocked: false,
            rejectionReason,
            reviewedBy: adminId,
            reviewedAt: new Date().toISOString(),
          }
        : s
    );
    setSubmissions(updated);
    await AsyncStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(updated));
    console.log('[Challenges] Submission rejected:', submissionId, 'Reason:', rejectionReason);
    return true;
  }, [submissions]);

  const getPendingSubmissions = useCallback(() => {
    return (submissions || []).filter(s => s.reviewStatus === 'pending');
  }, [submissions]);

  const getSubmissionById = useCallback((submissionId: string) => {
    return (submissions || []).find(s => s.id === submissionId);
  }, [submissions]);

  return useMemo(
    () => ({
      challenges,
      submissions,
      isLoading,
      getChallengeStatus,
      createChallenge,
      updateChallenge,
      deleteChallenge,
      submitChallenge,
      getUserSubmissions,
      getChallengesByStatus,
      getActiveChallenges,
      getIncomingChallenges,
      getEndedChallenges,
      getChallengeById,
      hasUserSubmitted,
      getUserSuccessfulSubmissions,
      approveSubmission,
      rejectSubmission,
      getPendingSubmissions,
      getSubmissionById,
    }),
    [
      challenges,
      submissions,
      isLoading,
      getChallengeStatus,
      createChallenge,
      updateChallenge,
      deleteChallenge,
      submitChallenge,
      getUserSubmissions,
      getChallengesByStatus,
      getActiveChallenges,
      getIncomingChallenges,
      getEndedChallenges,
      getChallengeById,
      hasUserSubmitted,
      getUserSuccessfulSubmissions,
      approveSubmission,
      rejectSubmission,
      getPendingSubmissions,
      getSubmissionById,
    ]
  );
});

export type ChallengesContextType = ReturnType<typeof useChallenges>;
