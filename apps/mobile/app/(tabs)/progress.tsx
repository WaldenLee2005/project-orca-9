import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from "react-native";
import { trackDevOperation } from "../../src/dev/devDiagnosticsStore";
import {
  SessionExercise,
  sessionExercises
} from "../../src/features/workouts/repdbSessionExercises";
import {
  getProgressAverageWeightSeries,
  getProgressLiftOptions,
  getProgressStrengthSeries,
  getProgressVolumeSeries,
  ProgressAverageWeightPoint,
  ProgressLiftOption,
  ProgressStrengthPoint,
  ProgressVolumePoint
} from "../../src/storage/workoutsRepository";
import { useAppTheme } from "../../src/theme/ThemeProvider";

type ProgressRange = "1M" | "3M" | "All";
type ProgressTab = "prs" | "averageWeight" | "volume";
type ProgressStep = "dashboard" | "picker";
type ChartDatum = {
  id: string;
  completedAt: string;
  value: number;
};
type RunningPrPoint = ChartDatum & {
  exerciseName: string;
  isNewPr: boolean;
  reps: number;
  weight: number;
};

const progressRanges: ProgressRange[] = ["1M", "3M", "All"];
const progressTabs: { key: ProgressTab; label: string }[] = [
  { key: "prs", label: "PRs" },
  { key: "averageWeight", label: "Avg Weight" },
  { key: "volume", label: "Volume" }
];
const chartPadding = 14;

export default function ProgressScreen() {
  const theme = useAppTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [step, setStep] = useState<ProgressStep>("dashboard");
  const [selectedTab, setSelectedTab] = useState<ProgressTab>("prs");
  const [selectedLiftKey, setSelectedLiftKey] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<ProgressRange>("3M");
  const [liftOptions, setLiftOptions] = useState<ProgressLiftOption[]>([]);
  const [strengthSeries, setStrengthSeries] = useState<ProgressStrengthPoint[]>([]);
  const [averageWeightSeries, setAverageWeightSeries] = useState<ProgressAverageWeightPoint[]>([]);
  const [volumeSeries, setVolumeSeries] = useState<ProgressVolumePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const selectedLiftName = useMemo(() => {
    return selectedLiftKey ? liftOptions.find((lift) => lift.key === selectedLiftKey)?.name ?? "Selected lift" : "All Lifts";
  }, [liftOptions, selectedLiftKey]);

  const rangedStrengthSeries = useMemo(
    () => filterSeriesByRange(strengthSeries, selectedRange),
    [selectedRange, strengthSeries]
  );
  const rangedAverageWeightSeries = useMemo(
    () => filterSeriesByRange(averageWeightSeries, selectedRange),
    [averageWeightSeries, selectedRange]
  );
  const rangedVolumeSeries = useMemo(() => filterSeriesByRange(volumeSeries, selectedRange), [selectedRange, volumeSeries]);
  const prSeries = useMemo(() => getRunningPrSeries(rangedStrengthSeries), [rangedStrengthSeries]);
  const chartData =
    selectedTab === "prs"
      ? toPrChartData(prSeries)
      : selectedTab === "averageWeight"
        ? toAverageWeightChartData(rangedAverageWeightSeries)
        : toVolumeChartData(rangedVolumeSeries);
  const latestPr = prSeries[prSeries.length - 1];
  const previousPr = prSeries.slice(0, -1).reverse().find((point) => point.isNewPr);
  const latestAverageWeight = rangedAverageWeightSeries[rangedAverageWeightSeries.length - 1];
  const previousAverageWeight = rangedAverageWeightSeries[rangedAverageWeightSeries.length - 2];
  const latestVolume = rangedVolumeSeries[rangedVolumeSeries.length - 1];
  const previousVolume = rangedVolumeSeries[rangedVolumeSeries.length - 2];
  const weightedAverage = getWeightedAverageWeight(rangedAverageWeightSeries);
  const totalVolume = rangedVolumeSeries.reduce((sum, point) => sum + point.volume, 0);
  const chartHeight = getDashboardChartHeight(windowHeight);
  const metricSet = selectedTab === "prs"
    ? {
        firstLabel: "Current PR",
        firstValue: latestPr ? `${formatWeight(latestPr.value)} lb` : "-",
        secondLabel: "PR Set",
        secondValue: latestPr ? `${formatWeight(latestPr.weight)} x ${latestPr.reps}` : "-",
        thirdLabel: "Previous PR",
        thirdValue: previousPr ? `${formatWeight(previousPr.value)} lb` : "-"
      }
    : selectedTab === "averageWeight"
      ? {
          firstLabel: "Latest Avg",
          firstValue: latestAverageWeight ? `${formatWeight(latestAverageWeight.averageWeight)} lb` : "-",
          secondLabel: "Range Avg",
          secondValue: `${formatWeight(weightedAverage)} lb`,
          thirdLabel: "Last Change",
          thirdValue: latestAverageWeight && previousAverageWeight
            ? formatSignedWeight(latestAverageWeight.averageWeight - previousAverageWeight.averageWeight)
            : "0 lb"
      }
    : {
        firstLabel: "Latest",
        firstValue: latestVolume ? `${formatWeight(latestVolume.volume)} lb` : "-",
        secondLabel: "Range Total",
        secondValue: `${formatWeight(totalVolume)} lb`,
        thirdLabel: "Last Change",
        thirdValue: latestVolume && previousVolume ? formatSignedWeight(latestVolume.volume - previousVolume.volume) : "0 lb"
      };

  const categories = useMemo(() => {
    return getSavedPickerExercises(liftOptions).reduce<Record<string, SessionExercise[]>>((groups, exercise) => {
      groups[exercise.category] = [...(groups[exercise.category] ?? []), exercise];
      return groups;
    }, {});
  }, [liftOptions]);

  const loadProgress = useCallback(async () => {
    const operation = trackDevOperation("Load progress chart", selectedLiftKey ?? "all lifts");
    setIsLoading(true);

    try {
      const [nextLiftOptions, nextStrengthSeries, nextAverageWeightSeries, nextVolumeSeries] = await Promise.all([
        getProgressLiftOptions(),
        getProgressStrengthSeries({ liftKey: selectedLiftKey, limit: 160 }),
        getProgressAverageWeightSeries({ liftKey: selectedLiftKey, limit: 160 }),
        getProgressVolumeSeries({ liftKey: selectedLiftKey, limit: 160 })
      ]);

      setLiftOptions(nextLiftOptions);
      setStrengthSeries(nextStrengthSeries);
      setAverageWeightSeries(nextAverageWeightSeries);
      setVolumeSeries(nextVolumeSeries);
      setLoadError(null);
      operation.resolve(`${nextStrengthSeries.length} strength points loaded.`);
    } catch (error) {
      setLoadError("Could not load saved session progress.");
      operation.fail(error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedLiftKey]);

  useFocusEffect(
    useCallback(() => {
      loadProgress();
    }, [loadProgress])
  );

  function chooseLift(liftKey: string | null) {
    setSelectedLiftKey(liftKey);
    setStep("dashboard");
  }

  if (step === "picker") {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.pickerContent}
      >
        <Pressable accessibilityRole="button" onPress={() => setStep("dashboard")} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
          <Text style={[styles.backText, { color: theme.colors.text }]}>Progress</Text>
        </Pressable>

        <View style={styles.pickerHeader}>
          <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>Chart Lift</Text>
          <Text style={[styles.title, { color: theme.colors.text }]}>Choose Exercise</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => chooseLift(null)}
          style={({ pressed }) => [
            styles.overallPickerButton,
            {
              borderColor: theme.colors.border,
              opacity: pressed ? 0.72 : 1
            }
          ]}
        >
          <Ionicons name="analytics-outline" size={22} color={theme.colors.text} />
          <View style={styles.overallPickerText}>
            <Text style={[styles.overallPickerTitle, { color: theme.colors.text }]}>All Lifts</Text>
            <Text style={[styles.overallPickerCopy, { color: theme.colors.secondaryText }]}>
              Combined PR, average weight, and volume trends.
            </Text>
          </View>
        </Pressable>

        {Object.entries(categories).map(([category, exercises]) => (
          <View key={category} style={styles.categorySection}>
            <Text style={[styles.categoryTitle, { color: theme.colors.text }]}>{category}</Text>
            <View style={styles.exerciseGrid}>
              {exercises.map((exercise) => (
                <ExercisePickerCard
                  exercise={exercise}
                  isSelected={selectedLiftKey === exercise.id}
                  key={exercise.id}
                  onPress={() => chooseLift(exercise.id)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>Trends</Text>
        <Text style={[styles.title, { color: theme.colors.text }]}>Progress</Text>
        <Text style={[styles.description, { color: theme.colors.secondaryText }]}>
          PRs show your best estimated max from saved sessions.
        </Text>
      </View>

      <View style={styles.tabRow}>
        {progressTabs.map((tab) => (
          <Pressable
            accessibilityRole="button"
            key={tab.key}
            onPress={() => setSelectedTab(tab.key)}
            style={({ pressed }) => [
              styles.tabButton,
              {
                backgroundColor: selectedTab === tab.key ? theme.colors.accent : theme.colors.background,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.76 : 1
              }
            ]}
          >
            <Text style={[styles.tabText, { color: selectedTab === tab.key ? theme.colors.onAccent : theme.colors.secondaryText }]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setStep("picker")}
        style={({ pressed }) => [
          styles.liftButton,
          {
            borderColor: theme.colors.border,
            opacity: pressed ? 0.72 : 1
          }
        ]}
      >
        <View style={styles.liftButtonTextGroup}>
          <Text style={[styles.chartEyebrow, { color: theme.colors.mutedText }]}>Charting</Text>
          <Text style={[styles.liftButtonTitle, { color: theme.colors.text }]}>{selectedLiftName}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.text} />
      </Pressable>

      <View style={styles.metricRow}>
        <MetricBlock label={metricSet.firstLabel} value={metricSet.firstValue} />
        <MetricBlock label={metricSet.secondLabel} value={metricSet.secondValue} />
        <MetricBlock label={metricSet.thirdLabel} value={metricSet.thirdValue} />
      </View>

      <View style={[styles.chartPanel, { borderColor: theme.colors.border }]}>
        <View style={styles.chartHeader}>
          <View style={styles.chartTitleGroup}>
            <Text style={[styles.chartEyebrow, { color: theme.colors.mutedText }]}>
              {selectedTab === "prs" ? "Personal Records" : selectedTab === "averageWeight" ? "Average Weight" : "Volume"}
            </Text>
            <Text style={[styles.chartTitle, { color: theme.colors.text }]}>
              {selectedTab === "prs"
                ? `${selectedLiftName} PRs`
                : selectedTab === "averageWeight"
                  ? `${selectedLiftName} Avg Weight`
                  : `${selectedLiftName} Volume`}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={loadProgress}
            style={({ pressed }) => [styles.iconButton, { borderColor: theme.colors.border, opacity: pressed ? 0.72 : 1 }]}
          >
            <Ionicons name="refresh" size={18} color={theme.colors.text} />
          </Pressable>
        </View>

        <ProgressLineChart
          chartHeight={chartHeight}
          data={chartData}
          emptyText={
            selectedTab === "prs"
              ? "Save heavy sets to build PRs."
              : selectedTab === "averageWeight"
                ? "Save reps to build average weight."
                : "Save sessions to build volume."
          }
          isLoading={isLoading}
          unit="lb"
        />

        {selectedTab === "prs" && latestPr ? (
          <Text style={[styles.chartNote, { color: theme.colors.secondaryText }]}>
            Current PR source: {latestPr.exerciseName} / {formatWeight(latestPr.weight)} x {latestPr.reps}
          </Text>
        ) : null}
        {selectedTab === "averageWeight" && latestAverageWeight ? (
          <Text style={[styles.chartNote, { color: theme.colors.secondaryText }]}>
            Latest average uses {formatWeight(latestAverageWeight.totalReps)} reps from that session.
          </Text>
        ) : null}
        {loadError ? <Text style={[styles.errorText, { color: theme.colors.accent }]}>{loadError}</Text> : null}
      </View>

      <View style={styles.segmentRow}>
        {progressRanges.map((range) => (
          <Pressable
            accessibilityRole="button"
            key={range}
            onPress={() => setSelectedRange(range)}
            style={({ pressed }) => [
              styles.segmentButton,
              {
                backgroundColor: selectedRange === range ? theme.colors.accent : theme.colors.background,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.76 : 1
              }
            ]}
          >
            <Text
              style={[
                styles.segmentText,
                { color: selectedRange === range ? theme.colors.onAccent : theme.colors.secondaryText }
              ]}
            >
              {range}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

type ExercisePickerCardProps = {
  exercise: SessionExercise;
  isSelected: boolean;
  onPress: () => void;
};

function ExercisePickerCard({ exercise, isSelected, onPress }: ExercisePickerCardProps) {
  const theme = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.exerciseCard,
        {
          borderColor: isSelected ? theme.colors.accent : theme.colors.border,
          opacity: pressed ? 0.78 : 1
        }
      ]}
    >
      <View style={styles.exerciseImagePanel}>
        <Image source={exercise.image} resizeMode="contain" style={styles.exerciseImage} />
      </View>
      <View style={styles.exerciseText}>
        <Text style={[styles.exerciseName, { color: theme.colors.text }]}>{exercise.name}</Text>
        <Text style={[styles.exerciseMeta, { color: theme.colors.secondaryText }]}>{exercise.equipment}</Text>
      </View>
    </Pressable>
  );
}

type MetricBlockProps = {
  label: string;
  value: string;
};

function MetricBlock({ label, value }: MetricBlockProps) {
  const theme = useAppTheme();

  return (
    <View style={[styles.metricBlock, { borderColor: theme.colors.border }]}>
      <Text style={[styles.metricValue, { color: theme.colors.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: theme.colors.mutedText }]}>{label}</Text>
    </View>
  );
}

type ProgressLineChartProps = {
  chartHeight: number;
  data: ChartDatum[];
  emptyText: string;
  isLoading: boolean;
  unit: string;
};

function ProgressLineChart({ chartHeight, data, emptyText, isLoading, unit }: ProgressLineChartProps) {
  const theme = useAppTheme();
  const [chartWidth, setChartWidth] = useState(1);
  const chartPoints = useMemo(() => getChartPoints(data, chartWidth, chartHeight), [chartHeight, chartWidth, data]);
  const maxValue = data.reduce((max, point) => Math.max(max, point.value), 0);

  function handleLayout(event: LayoutChangeEvent) {
    setChartWidth(Math.max(1, event.nativeEvent.layout.width));
  }

  if (isLoading) {
    return (
      <View style={[styles.chart, styles.centeredChart, { height: chartHeight }]} onLayout={handleLayout}>
        <Text style={[styles.emptyText, { color: theme.colors.secondaryText }]}>Loading saved sessions...</Text>
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View style={[styles.chart, styles.centeredChart, { height: chartHeight }]} onLayout={handleLayout}>
        <Ionicons name="barbell-outline" size={24} color={theme.colors.secondaryText} />
        <Text style={[styles.emptyText, { color: theme.colors.secondaryText }]}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.chart, { height: chartHeight }]} onLayout={handleLayout}>
      {[0, 1, 2].map((line) => (
        <View
          key={line}
          style={[
            styles.gridLine,
            {
              backgroundColor: theme.colors.border,
              top: chartPadding + line * ((chartHeight - chartPadding * 2 - 28) / 2)
            }
          ]}
        />
      ))}

      {chartPoints.slice(1).map((point, index) => {
        const previousPoint = chartPoints[index];
        const length = Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);
        const angle = Math.atan2(point.y - previousPoint.y, point.x - previousPoint.x);

        return (
          <View
            key={`${point.id}-line`}
            style={[
              styles.chartSegment,
              {
                backgroundColor: theme.colors.accent,
                left: (point.x + previousPoint.x) / 2 - length / 2,
                top: (point.y + previousPoint.y) / 2,
                transform: [{ rotateZ: `${angle}rad` }],
                width: length
              }
            ]}
          />
        );
      })}

      {chartPoints.map((point) => (
        <View
          key={`${point.id}-dot`}
          style={[
            styles.chartDot,
            {
              backgroundColor: theme.colors.background,
              borderColor: theme.colors.accent,
              left: point.x - 4,
              top: point.y - 4
            }
          ]}
        />
      ))}

      <View style={styles.chartFooter}>
        <Text style={[styles.axisLabel, { color: theme.colors.mutedText }]}>{formatPointDate(data[0].completedAt)}</Text>
        <Text style={[styles.axisLabel, { color: theme.colors.mutedText }]}>
          {formatWeight(maxValue)} {unit} high
        </Text>
        <Text style={[styles.axisLabel, { color: theme.colors.mutedText }]}>
          {formatPointDate(data[data.length - 1].completedAt)}
        </Text>
      </View>
    </View>
  );
}

function getSavedPickerExercises(liftOptions: ProgressLiftOption[]) {
  return liftOptions.map((option) => {
    const catalogExercise = sessionExercises.find((exercise) => exercise.id === option.key);

    return catalogExercise ?? {
      id: option.key,
      name: option.name,
      category: "Custom",
      focus: "Saved custom exercise",
      equipment: "Custom",
      image: sessionExercises[0].image
    };
  });
}

function getRunningPrSeries(data: ProgressStrengthPoint[]): RunningPrPoint[] {
  let currentPr: RunningPrPoint | null = null;

  return data.map((point) => {
    const isNewPr = !currentPr || point.estimatedOneRepMax > currentPr.value;

    if (isNewPr) {
      currentPr = {
        id: point.id,
        completedAt: point.completedAt,
        exerciseName: point.exerciseName,
        isNewPr,
        reps: point.reps,
        value: point.estimatedOneRepMax,
        weight: point.weight
      };
    }

    const activePr = currentPr ?? {
      id: point.id,
      completedAt: point.completedAt,
      exerciseName: point.exerciseName,
      isNewPr,
      reps: point.reps,
      value: point.estimatedOneRepMax,
      weight: point.weight
    };

    return {
      ...activePr,
      id: point.id,
      completedAt: point.completedAt,
      isNewPr
    };
  });
}

function toPrChartData(data: RunningPrPoint[]) {
  return data.map((point) => ({
    id: point.id,
    completedAt: point.completedAt,
    value: point.value
  }));
}

function toAverageWeightChartData(data: ProgressAverageWeightPoint[]) {
  return data.map((point) => ({
    id: point.id,
    completedAt: point.completedAt,
    value: point.averageWeight
  }));
}

function toVolumeChartData(data: ProgressVolumePoint[]) {
  return data.map((point) => ({
    id: point.id,
    completedAt: point.completedAt,
    value: point.volume
  }));
}

function getWeightedAverageWeight(data: ProgressAverageWeightPoint[]) {
  const totalReps = data.reduce((sum, point) => sum + point.totalReps, 0);

  if (totalReps === 0) {
    return 0;
  }

  return data.reduce((sum, point) => sum + point.averageWeight * point.totalReps, 0) / totalReps;
}

function getDashboardChartHeight(windowHeight: number) {
  if (windowHeight < 720) {
    return 210;
  }

  return Math.min(360, Math.max(240, windowHeight - 560));
}

function getChartPoints(data: ChartDatum[], width: number, height: number) {
  const minValue = Math.min(...data.map((point) => point.value), 0);
  const maxValue = Math.max(...data.map((point) => point.value), 1);
  const plotWidth = Math.max(1, width - chartPadding * 2);
  const plotHeight = height - chartPadding * 2 - 28;
  const valueRange = Math.max(1, maxValue - minValue);

  return data.map((point, index) => ({
    id: point.id,
    x: chartPadding + (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth),
    y: chartPadding + (1 - (point.value - minValue) / valueRange) * plotHeight
  }));
}

function filterSeriesByRange<T extends { completedAt: string }>(data: T[], range: ProgressRange) {
  if (range === "All") {
    return data;
  }

  const days = range === "1M" ? 31 : 93;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return data.filter((point) => new Date(point.completedAt).getTime() >= cutoff);
}

function formatPointDate(value: string) {
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatWeight(value: number) {
  return Math.round(value).toLocaleString();
}

function formatSignedWeight(value: number) {
  if (Math.round(value) === 0) {
    return "0 lb";
  }

  return `${value > 0 ? "+" : ""}${formatWeight(value)} lb`;
}

const styles = StyleSheet.create({
  axisLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  backButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
    minHeight: 44,
    paddingRight: 12
  },
  backText: {
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  categorySection: {
    gap: 12,
    marginTop: 30
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  centeredChart: {
    alignItems: "center",
    gap: 10,
    justifyContent: "center"
  },
  chart: {
    marginTop: 10,
    overflow: "hidden",
    position: "relative",
    width: "100%"
  },
  chartDot: {
    borderRadius: 8,
    borderWidth: 2,
    height: 8,
    position: "absolute",
    width: 8
  },
  chartEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  chartFooter: {
    alignItems: "center",
    bottom: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    left: 0,
    position: "absolute",
    right: 0
  },
  chartHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  chartNote: {
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
    marginTop: 8,
    textTransform: "uppercase"
  },
  chartPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
    padding: 12
  },
  chartSegment: {
    height: 2,
    position: "absolute"
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 22,
    marginTop: 2,
    textTransform: "uppercase"
  },
  chartTitleGroup: {
    flex: 1,
    paddingRight: 12
  },
  content: {
    paddingBottom: 88,
    paddingHorizontal: 20,
    paddingTop: 48
  },
  description: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 6
  },
  emptyText: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    textAlign: "center",
    textTransform: "uppercase"
  },
  errorText: {
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 12,
    textTransform: "uppercase"
  },
  exerciseCard: {
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 238,
    overflow: "hidden",
    width: "48%"
  },
  exerciseGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12
  },
  exerciseImage: {
    height: "100%",
    width: "100%"
  },
  exerciseImagePanel: {
    aspectRatio: 1,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    overflow: "hidden",
    width: "100%"
  },
  exerciseMeta: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    marginTop: 6,
    textTransform: "uppercase"
  },
  exerciseName: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18
  },
  exerciseText: {
    minHeight: 74,
    padding: 12
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  gridLine: {
    height: StyleSheet.hairlineWidth,
    left: 0,
    opacity: 0.7,
    position: "absolute",
    right: 0
  },
  header: {
    maxWidth: 520
  },
  iconButton: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  liftButton: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  liftButtonTextGroup: {
    flex: 1,
    paddingRight: 12
  },
  liftButtonTitle: {
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 2,
    textTransform: "uppercase"
  },
  metricBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 58,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13,
    marginTop: 4,
    textTransform: "uppercase"
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 20
  },
  overallPickerButton: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    minHeight: 72,
    padding: 14
  },
  overallPickerCopy: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    marginTop: 4
  },
  overallPickerText: {
    flex: 1
  },
  overallPickerTitle: {
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  pickerContent: {
    paddingBottom: 118,
    paddingHorizontal: 20,
    paddingTop: 72
  },
  pickerHeader: {
    gap: 10,
    marginTop: 8
  },
  screen: {
    flex: 1
  },
  segmentButton: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 36,
    justifyContent: "center"
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10
  },
  segmentText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  tabButton: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 10
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 18
  },
  tabText: {
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
    textTransform: "uppercase"
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 34,
    marginTop: 6,
    textTransform: "uppercase"
  }
});
