/**
 * Revision 24 (#11) — the way into private shifts, and the live line while one
 * is running ("at the shop", "driving back by 19:40", "away: time is being
 * deducted"). Renders nothing for a driver who is neither eligible nor booked,
 * so the regular screens stay as they were for everyone else.
 */
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Store } from "lucide-react-native";
import { ListGroup, ListRow } from "./hig";
import { fetchCurrentPrivateShift, fetchPrivateShifts, kuwaitClock, type LiveState } from "../api/privateShifts";
import { t as tr } from "../i18n/strings";
import { useTheme } from "../theme";

export default function PrivateShiftEntry({ style }: { style?: object }) {
  const { c } = useTheme();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [subtitle, setSubtitle] = useState<string>("");
  const [tone, setTone] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const [list, cur] = await Promise.all([fetchPrivateShifts(), fetchCurrentPrivateShift()]);
      const booked = list.mine.some((s) => s.status === "BOOKED" || s.status === "IN_PROGRESS");
      setVisible(list.eligible || booked);
      const state: LiveState | null = cur.live?.state ?? null;
      if (cur.shift?.status === "IN_PROGRESS" && state) {
        const label =
          state === "RETURNING"
            ? tr("private.state_returning", { time: cur.live?.returnByAt ? kuwaitClock(cur.live.returnByAt) : "" })
            : tr(
                state === "AT_VENDOR"
                  ? "private.state_at_shop"
                  : state === "ON_ORDER"
                    ? "private.state_on_order"
                    : state === "AWAY"
                      ? "private.state_away"
                      : "private.state_unknown",
              );
        setSubtitle(label);
        setTone(state === "AWAY" ? c.red : undefined);
      } else if (cur.shift) {
        setSubtitle(tr("private.next_shift", { time: kuwaitClock(cur.shift.startAt) }));
        setTone(undefined);
      } else {
        setSubtitle(tr("private.entry_hint"));
        setTone(undefined);
      }
    } catch {
      /* the regular screen must not fail because this feature did */
    }
  }, [c.red]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!visible) return null;
  return (
    <ListGroup style={style}>
      <ListRow
        testID="private-shifts-entry"
        icon={<Store size={18} color={c.tint} />}
        title={tr("private.title")}
        subtitle={subtitle}
        titleColor={tone}
        chevron
        onPress={() => router.push("/private-shifts")}
      />
    </ListGroup>
  );
}
