"use client";

import {
  useQueryState,
  parseAsString,
  parseAsFloat,
  parseAsStringLiteral,
  parseAsArrayOf,
} from "nuqs";

const minutesModes = ["All", "Over", "Under"] as const;
const withWithoutModes = ["with", "without"] as const;

export function useFilters() {
  const [year, setYear] = useQueryState(
    "year",
    parseAsArrayOf(parseAsString).withDefault([])
  );
  const [position, setPosition] = useQueryState(
    "position",
    parseAsString.withDefault("All")
  );
  const [minMinutes, setMinMinutes] = useQueryState(
    "minMins",
    parseAsFloat.withDefault(0)
  );
  const [minutesMode, setMinutesMode] = useQueryState(
    "minsMode",
    parseAsStringLiteral(minutesModes).withDefault("All")
  );
  const [player1, setPlayer1] = useQueryState(
    "p1",
    parseAsString.withDefault("")
  );
  const [player2, setPlayer2] = useQueryState(
    "p2",
    parseAsString.withDefault("")
  );
  const [team1, setTeam1] = useQueryState(
    "t1",
    parseAsString.withDefault("")
  );
  const [team2, setTeam2] = useQueryState(
    "t2",
    parseAsString.withDefault("")
  );
  const [stat1, setStat1] = useQueryState(
    "s1",
    parseAsString.withDefault("")
  );
  const [stat2, setStat2] = useQueryState(
    "s2",
    parseAsString.withDefault("None")
  );
  const [teammate1, setTeammate1] = useQueryState(
    "tm1",
    parseAsString.withDefault("None")
  );
  const [teammate2, setTeammate2] = useQueryState(
    "tm2",
    parseAsString.withDefault("None")
  );
  const [withWithout1, setWithWithout1] = useQueryState(
    "ww1",
    parseAsStringLiteral(withWithoutModes).withDefault("with")
  );
  const [withWithout2, setWithWithout2] = useQueryState(
    "ww2",
    parseAsStringLiteral(withWithoutModes).withDefault("with")
  );

  return {
    year, setYear,
    position, setPosition,
    minMinutes, setMinMinutes,
    minutesMode, setMinutesMode,
    player1, setPlayer1,
    player2, setPlayer2,
    team1, setTeam1,
    team2, setTeam2,
    stat1, setStat1,
    stat2, setStat2,
    teammate1, setTeammate1,
    teammate2, setTeammate2,
    withWithout1, setWithWithout1,
    withWithout2, setWithWithout2,
  };
}
