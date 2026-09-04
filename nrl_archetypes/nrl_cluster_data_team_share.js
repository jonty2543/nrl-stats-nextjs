const clusterDataTeamShare = {
    "All": {
        "Fullback": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Ball Running Fullback",
                    "count": 96,
                    "description": "Fullbacks who are quick and able to break the defensive line, and opt for game breaking runs over tough carries."
                },
                {
                    "id": 1,
                    "name": "Balanced Fullback",
                    "count": 147,
                    "description": "These well rounded fullbacks balance workrate, playmaking and elusiveness making them the complete package."
                },
                {
                    "id": 2,
                    "name": "Workhorse Fullback",
                    "count": 100,
                    "description": "High-effort players who are always around the ball. They rack up high run metres and support plays."
                },
                {
                    "id": 3,
                    "name": "Playmaker Fullback",
                    "count": 93,
                    "description": "These playmakers save their energy for the big moments, with reduced workrates but high involvement in tries and try assists."
                },
                {
                    "id": 4,
                    "name": "Support Fullback",
                    "count": 214,
                    "description": "Players who are less involved in attack, but may specialise in defense or defusing kicks."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Playmaking",
                    "features": [
                        "line_break_assists_team_share",
                        "try_assists_team_share",
                        "passes_team_share"
                    ]
                },
                "pc2": {
                    "name": "Evasiveness",
                    "features": [
                        "line_breaks_team_share",
                        "tries_team_share",
                        "tackle_breaks_team_share"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "post_contact_metres_team_share",
                        "all_runs_team_share"
                    ]
                }
            }
        },
        "Winger": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Support Winger",
                    "count": 583,
                    "description": "These wingers tend to be less involved in the game, perhaps due to lack of skill or opportunity."
                },
                {
                    "id": 1,
                    "name": "Finisher Winger",
                    "count": 320,
                    "description": "Wingers who are specialist try scorers, often with great positional awareness and speed."
                },
                {
                    "id": 2,
                    "name": "Workhorse Winger",
                    "count": 460,
                    "description": "High involvement wingers who are strong in contact, often taking carries out of their own end."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Strength In Contact",
                    "features": [
                        "tackle_breaks_team_share",
                        "offloads_team_share",
                        "post_contact_metres_team_share"
                    ]
                },
                "pc2": {
                    "name": "Try Scoring",
                    "features": [
                        "tries_team_share",
                        "line_breaks_team_share"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "all_runs_team_share"
                    ]
                }
            }
        },
        "Centre": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Link Centre",
                    "count": 233,
                    "description": "These centres play more of a Five-Eighth role with a high pass to run ratio, often looking to set up their winger."
                },
                {
                    "id": 1,
                    "name": "Workhorse Centre",
                    "count": 351,
                    "description": "Attacking weapons who are heavily involved in gaining metres aswell as breaking the line and scoring tries."
                },
                {
                    "id": 2,
                    "name": "Support Centre",
                    "count": 429,
                    "description": "These players are less involved with ball in hand and may play other roles for the team."
                },
                {
                    "id": 3,
                    "name": "Strike Centre",
                    "count": 309,
                    "description": "Centres who are heavily involved in try scoring, and may look to set up those around them rather than taking tough carries."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Passing",
                    "features": [
                        "passes_team_share",
                        "pass_run_ratio",
                        "line_break_assists_team_share",
                        "try_assists_team_share"
                    ]
                },
                "pc2": {
                    "name": "Try Scoring",
                    "features": [
                        "tries_team_share",
                        "line_breaks_team_share"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "all_runs_team_share"
                    ]
                }
            }
        },
        "Half": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Dominant Half",
                    "count": 373,
                    "description": "These players control the attack, and are usually relied upon to set up tries and do most of the kicking."
                },
                {
                    "id": 1,
                    "name": "Running Half",
                    "count": 343,
                    "description": "Halves with strong running games who look to break the line, usually Five-Eighths."
                },
                {
                    "id": 2,
                    "name": "Organising Half",
                    "count": 488,
                    "description": "Less dominant halves who may rely on their halves partner to control the attack, focusing on organising their edge."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Running",
                    "features": [
                        "tries_team_share",
                        "all_run_metres_team_share",
                        "line_breaks_team_share",
                        "tackle_breaks_team_share"
                    ]
                },
                "pc2": {
                    "name": "Creativity",
                    "features": [
                        "line_break_assists_team_share",
                        "try_assists_team_share",
                        "forced_drop_outs_team_share",
                        "forty_twenty_team_share"
                    ]
                },
                "pc3": {
                    "name": "Kicking",
                    "features": [
                        "kicks_team_share",
                        "kicking_metres_team_share",
                        "one_point_field_goals_team_share"
                    ]
                }
            }
        },
        "Hooker": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Balanced Hooker",
                    "count": 257,
                    "description": "Hookers who balance dummy half runs and creativity."
                },
                {
                    "id": 1,
                    "name": "Running Hooker",
                    "count": 107,
                    "description": "Strong ball running hookers who often look to run from dummy half."
                },
                {
                    "id": 2,
                    "name": "Link Hooker",
                    "count": 121,
                    "description": "Hookers that look to pass rather than run, usually having strong ball playing."
                },
                {
                    "id": 3,
                    "name": "Crafty Hooker",
                    "count": 88,
                    "description": "Creative types who specialise in finding the right pass for their forwards."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Ball Running",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "line_breaks_team_share",
                        "tries_team_share"
                    ]
                },
                "pc2": {
                    "name": "Creativity",
                    "features": [
                        "try_assists_team_share",
                        "line_break_assists_team_share",
                        "forty_twenty_team_share",
                        "forced_drop_outs_team_share"
                    ]
                },
                "pc3": {
                    "name": "Pass - Run Ratio",
                    "features": [
                        "passes_to_run_ratio"
                    ]
                }
            }
        },
        "Edge": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Defensive Enforcer Edge",
                    "count": 486,
                    "description": "Defensive specialists who are key in protecting their edge. Less involved in attacking situations."
                },
                {
                    "id": 1,
                    "name": "Support Edge",
                    "count": 477,
                    "description": "These edges are less involved in attack and defense, and may specialise in other areas."
                },
                {
                    "id": 2,
                    "name": "Strong Attacking Edge",
                    "count": 138,
                    "description": "These players are strong in contact and are relied upon to make metres for their team, often involved in tries as a result."
                },
                {
                    "id": 3,
                    "name": "Strike Attacking Edge",
                    "count": 202,
                    "description": "Great line runners, often breaking the line and scoring tries, playing like a centre in attack."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Attacking Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "offloads_team_share",
                        "hit_ups_team_share"
                    ]
                },
                "pc2": {
                    "name": "Attacking Threat",
                    "features": [
                        "line_breaks_team_share",
                        "tries_team_share"
                    ]
                },
                "pc3": {
                    "name": "Defensive Workrate",
                    "features": [
                        "tackles_made_team_share",
                        "tackle_efficiency"
                    ]
                }
            }
        },
        "Middle": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Ball Playing Middle",
                    "count": 101,
                    "description": "These middles often play in the lock position with strong ball playing skills, directing players in the middle of the park."
                },
                {
                    "id": 1,
                    "name": "Impact Middle",
                    "count": 281,
                    "description": "The most effective ball runners, these middles are characterised by strong carries, tackle breaks and post-contact metres."
                },
                {
                    "id": 2,
                    "name": "Standard Middle",
                    "count": 1316,
                    "description": "Making up the rest of the middle, these players share the hit up and tackling duties."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Ball Playing",
                    "features": [
                        "passes_to_run_ratio",
                        "passes_team_share",
                        "line_break_assists_team_share",
                        "try_assists_team_share"
                    ]
                },
                "pc2": {
                    "name": "Ball Running",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "post_contact_metres_team_share",
                        "offloads_team_share"
                    ]
                },
                "pc3": {
                    "name": "Defense",
                    "features": [
                        "tackles_made_team_share",
                        "tackle_efficiency"
                    ]
                }
            }
        }
    },
    "2000s": {
        "Fullback": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Ball Running Fullback",
                    "count": 38,
                    "description": "Fullbacks who are quick and able to break the defensive line, and opt for game breaking runs over tough carries."
                },
                {
                    "id": 1,
                    "name": "Balanced Fullback",
                    "count": 39,
                    "description": "These well rounded fullbacks balance workrate, playmaking and elusiveness making them the complete package."
                },
                {
                    "id": 2,
                    "name": "Workhorse Fullback",
                    "count": 28,
                    "description": "High-effort players who are always around the ball. They rack up high run metres and support plays."
                },
                {
                    "id": 3,
                    "name": "Playmaker Fullback",
                    "count": 37,
                    "description": "These playmakers save their energy for the big moments, with reduced workrates but high involvement in tries and try assists."
                },
                {
                    "id": 4,
                    "name": "Support Fullback",
                    "count": 67,
                    "description": "Players who are less involved in attack, but may specialise in defense or defusing kicks."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Playmaking",
                    "features": [
                        "line_break_assists_team_share",
                        "try_assists_team_share",
                        "passes_team_share"
                    ]
                },
                "pc2": {
                    "name": "Evasiveness",
                    "features": [
                        "line_breaks_team_share",
                        "tries_team_share",
                        "tackle_breaks_team_share"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "post_contact_metres_team_share",
                        "all_runs_team_share"
                    ]
                }
            }
        },
        "Winger": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Support Winger",
                    "count": 188,
                    "description": "These wingers tend to be less involved in the game, perhaps due to lack of skill or opportunity."
                },
                {
                    "id": 1,
                    "name": "Finisher Winger",
                    "count": 152,
                    "description": "Wingers who are specialist try scorers, often with great positional awareness and speed."
                },
                {
                    "id": 2,
                    "name": "Workhorse Winger",
                    "count": 125,
                    "description": "High involvement wingers who are strong in contact, often taking carries out of their own end."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Strength In Contact",
                    "features": [
                        "tackle_breaks_team_share",
                        "offloads_team_share",
                        "post_contact_metres_team_share"
                    ]
                },
                "pc2": {
                    "name": "Try Scoring",
                    "features": [
                        "tries_team_share",
                        "line_breaks_team_share"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "all_runs_team_share"
                    ]
                }
            }
        },
        "Centre": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Link Centre",
                    "count": 14,
                    "description": "These centres play more of a Five-Eighth role with a high pass to run ratio, often looking to set up their winger."
                },
                {
                    "id": 1,
                    "name": "Workhorse Centre",
                    "count": 144,
                    "description": "Attacking weapons who are heavily involved in gaining metres aswell as breaking the line and scoring tries."
                },
                {
                    "id": 2,
                    "name": "Support Centre",
                    "count": 170,
                    "description": "These players are less involved with ball in hand and may play other roles for the team."
                },
                {
                    "id": 3,
                    "name": "Strike Centre",
                    "count": 128,
                    "description": "Centres who are heavily involved in try scoring, and may look to set up those around them rather than taking tough carries."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Passing",
                    "features": [
                        "passes_team_share",
                        "pass_run_ratio",
                        "line_break_assists_team_share",
                        "try_assists_team_share"
                    ]
                },
                "pc2": {
                    "name": "Try Scoring",
                    "features": [
                        "tries_team_share",
                        "line_breaks_team_share"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "all_runs_team_share"
                    ]
                }
            }
        },
        "Half": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Dominant Half",
                    "count": 143,
                    "description": "These players control the attack, and are usually relied upon to set up tries and do most of the kicking."
                },
                {
                    "id": 1,
                    "name": "Running Half",
                    "count": 107,
                    "description": "Halves with strong running games who look to break the line, usually Five-Eighths."
                },
                {
                    "id": 2,
                    "name": "Organising Half",
                    "count": 171,
                    "description": "Less dominant halves who may rely on their halves partner to control the attack, focusing on organising their edge."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Running",
                    "features": [
                        "tries_team_share",
                        "all_run_metres_team_share",
                        "line_breaks_team_share",
                        "tackle_breaks_team_share"
                    ]
                },
                "pc2": {
                    "name": "Creativity",
                    "features": [
                        "line_break_assists_team_share",
                        "try_assists_team_share",
                        "forced_drop_outs_team_share",
                        "forty_twenty_team_share"
                    ]
                },
                "pc3": {
                    "name": "Kicking",
                    "features": [
                        "kicks_team_share",
                        "kicking_metres_team_share",
                        "one_point_field_goals_team_share"
                    ]
                }
            }
        },
        "Hooker": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Balanced Hooker",
                    "count": 126,
                    "description": "Hookers who balance dummy half runs and creativity."
                },
                {
                    "id": 1,
                    "name": "Running Hooker",
                    "count": 25,
                    "description": "Strong ball running hookers who often look to run from dummy half."
                },
                {
                    "id": 2,
                    "name": "Link Hooker",
                    "count": 11,
                    "description": "Hookers that look to pass rather than run, usually having strong ball playing."
                },
                {
                    "id": 3,
                    "name": "Crafty Hooker",
                    "count": 35,
                    "description": "Creative types who specialise in finding the right pass for their forwards."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Ball Running",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "line_breaks_team_share",
                        "tries_team_share"
                    ]
                },
                "pc2": {
                    "name": "Creativity",
                    "features": [
                        "try_assists_team_share",
                        "line_break_assists_team_share",
                        "forty_twenty_team_share",
                        "forced_drop_outs_team_share"
                    ]
                },
                "pc3": {
                    "name": "Pass - Run Ratio",
                    "features": [
                        "passes_to_run_ratio"
                    ]
                }
            }
        },
        "Edge": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Defensive Enforcer Edge",
                    "count": 181,
                    "description": "Defensive specialists who are key in protecting their edge. Less involved in attacking situations."
                },
                {
                    "id": 1,
                    "name": "Support Edge",
                    "count": 107,
                    "description": "These edges are less involved in attack and defense, and may specialise in other areas."
                },
                {
                    "id": 2,
                    "name": "Strong Attacking Edge",
                    "count": 70,
                    "description": "These players are strong in contact and are relied upon to make metres for their team, often involved in tries as a result."
                },
                {
                    "id": 3,
                    "name": "Strike Attacking Edge",
                    "count": 80,
                    "description": "Great line runners, often breaking the line and scoring tries, playing like a centre in attack."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Attacking Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "offloads_team_share",
                        "hit_ups_team_share"
                    ]
                },
                "pc2": {
                    "name": "Attacking Threat",
                    "features": [
                        "line_breaks_team_share",
                        "tries_team_share"
                    ]
                },
                "pc3": {
                    "name": "Defensive Workrate",
                    "features": [
                        "tackles_made_team_share",
                        "tackle_efficiency"
                    ]
                }
            }
        },
        "Middle": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Ball Playing Middle",
                    "count": 2,
                    "description": "These middles often play in the lock position with strong ball playing skills, directing players in the middle of the park."
                },
                {
                    "id": 1,
                    "name": "Impact Middle",
                    "count": 80,
                    "description": "The most effective ball runners, these middles are characterised by strong carries, tackle breaks and post-contact metres."
                },
                {
                    "id": 2,
                    "name": "Standard Middle",
                    "count": 518,
                    "description": "Making up the rest of the middle, these players share the hit up and tackling duties."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Ball Playing",
                    "features": [
                        "passes_to_run_ratio",
                        "passes_team_share",
                        "line_break_assists_team_share",
                        "try_assists_team_share"
                    ]
                },
                "pc2": {
                    "name": "Ball Running",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "post_contact_metres_team_share",
                        "offloads_team_share"
                    ]
                },
                "pc3": {
                    "name": "Defense",
                    "features": [
                        "tackles_made_team_share",
                        "tackle_efficiency"
                    ]
                }
            }
        }
    },
    "2010s": {
        "Fullback": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Ball Running Fullback",
                    "count": 37,
                    "description": "Fullbacks who are quick and able to break the defensive line, and opt for game breaking runs over tough carries."
                },
                {
                    "id": 1,
                    "name": "Balanced Fullback",
                    "count": 61,
                    "description": "These well rounded fullbacks balance workrate, playmaking and elusiveness making them the complete package."
                },
                {
                    "id": 2,
                    "name": "Workhorse Fullback",
                    "count": 48,
                    "description": "High-effort players who are always around the ball. They rack up high run metres and support plays."
                },
                {
                    "id": 3,
                    "name": "Playmaker Fullback",
                    "count": 46,
                    "description": "These playmakers save their energy for the big moments, with reduced workrates but high involvement in tries and try assists."
                },
                {
                    "id": 4,
                    "name": "Support Fullback",
                    "count": 67,
                    "description": "Players who are less involved in attack, but may specialise in defense or defusing kicks."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Playmaking",
                    "features": [
                        "line_break_assists_team_share",
                        "try_assists_team_share",
                        "passes_team_share"
                    ]
                },
                "pc2": {
                    "name": "Evasiveness",
                    "features": [
                        "line_breaks_team_share",
                        "tries_team_share",
                        "tackle_breaks_team_share"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "post_contact_metres_team_share",
                        "all_runs_team_share"
                    ]
                }
            }
        },
        "Winger": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Support Winger",
                    "count": 214,
                    "description": "These wingers tend to be less involved in the game, perhaps due to lack of skill or opportunity."
                },
                {
                    "id": 1,
                    "name": "Finisher Winger",
                    "count": 138,
                    "description": "Wingers who are specialist try scorers, often with great positional awareness and speed."
                },
                {
                    "id": 2,
                    "name": "Workhorse Winger",
                    "count": 171,
                    "description": "High involvement wingers who are strong in contact, often taking carries out of their own end."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Strength In Contact",
                    "features": [
                        "tackle_breaks_team_share",
                        "offloads_team_share",
                        "post_contact_metres_team_share"
                    ]
                },
                "pc2": {
                    "name": "Try Scoring",
                    "features": [
                        "tries_team_share",
                        "line_breaks_team_share"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "all_runs_team_share"
                    ]
                }
            }
        },
        "Centre": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Link Centre",
                    "count": 98,
                    "description": "These centres play more of a Five-Eighth role with a high pass to run ratio, often looking to set up their winger."
                },
                {
                    "id": 1,
                    "name": "Workhorse Centre",
                    "count": 133,
                    "description": "Attacking weapons who are heavily involved in gaining metres aswell as breaking the line and scoring tries."
                },
                {
                    "id": 2,
                    "name": "Support Centre",
                    "count": 160,
                    "description": "These players are less involved with ball in hand and may play other roles for the team."
                },
                {
                    "id": 3,
                    "name": "Strike Centre",
                    "count": 109,
                    "description": "Centres who are heavily involved in try scoring, and may look to set up those around them rather than taking tough carries."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Passing",
                    "features": [
                        "passes_team_share",
                        "pass_run_ratio",
                        "line_break_assists_team_share",
                        "try_assists_team_share"
                    ]
                },
                "pc2": {
                    "name": "Try Scoring",
                    "features": [
                        "tries_team_share",
                        "line_breaks_team_share"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "all_runs_team_share"
                    ]
                }
            }
        },
        "Half": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Dominant Half",
                    "count": 152,
                    "description": "These players control the attack, and are usually relied upon to set up tries and do most of the kicking."
                },
                {
                    "id": 1,
                    "name": "Running Half",
                    "count": 110,
                    "description": "Halves with strong running games who look to break the line, usually Five-Eighths."
                },
                {
                    "id": 2,
                    "name": "Organising Half",
                    "count": 183,
                    "description": "Less dominant halves who may rely on their halves partner to control the attack, focusing on organising their edge."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Running",
                    "features": [
                        "tries_team_share",
                        "all_run_metres_team_share",
                        "line_breaks_team_share",
                        "tackle_breaks_team_share"
                    ]
                },
                "pc2": {
                    "name": "Creativity",
                    "features": [
                        "line_break_assists_team_share",
                        "try_assists_team_share",
                        "forced_drop_outs_team_share",
                        "forty_twenty_team_share"
                    ]
                },
                "pc3": {
                    "name": "Kicking",
                    "features": [
                        "kicks_team_share",
                        "kicking_metres_team_share",
                        "one_point_field_goals_team_share"
                    ]
                }
            }
        },
        "Hooker": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Balanced Hooker",
                    "count": 103,
                    "description": "Hookers who balance dummy half runs and creativity."
                },
                {
                    "id": 1,
                    "name": "Running Hooker",
                    "count": 32,
                    "description": "Strong ball running hookers who often look to run from dummy half."
                },
                {
                    "id": 2,
                    "name": "Link Hooker",
                    "count": 46,
                    "description": "Hookers that look to pass rather than run, usually having strong ball playing."
                },
                {
                    "id": 3,
                    "name": "Crafty Hooker",
                    "count": 31,
                    "description": "Creative types who specialise in finding the right pass for their forwards."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Ball Running",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "line_breaks_team_share",
                        "tries_team_share"
                    ]
                },
                "pc2": {
                    "name": "Creativity",
                    "features": [
                        "try_assists_team_share",
                        "line_break_assists_team_share",
                        "forty_twenty_team_share",
                        "forced_drop_outs_team_share"
                    ]
                },
                "pc3": {
                    "name": "Pass - Run Ratio",
                    "features": [
                        "passes_to_run_ratio"
                    ]
                }
            }
        },
        "Edge": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Defensive Enforcer Edge",
                    "count": 272,
                    "description": "Defensive specialists who are key in protecting their edge. Less involved in attacking situations."
                },
                {
                    "id": 1,
                    "name": "Support Edge",
                    "count": 110,
                    "description": "These edges are less involved in attack and defense, and may specialise in other areas."
                },
                {
                    "id": 2,
                    "name": "Strong Attacking Edge",
                    "count": 56,
                    "description": "These players are strong in contact and are relied upon to make metres for their team, often involved in tries as a result."
                },
                {
                    "id": 3,
                    "name": "Strike Attacking Edge",
                    "count": 61,
                    "description": "Great line runners, often breaking the line and scoring tries, playing like a centre in attack."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Attacking Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "offloads_team_share",
                        "hit_ups_team_share"
                    ]
                },
                "pc2": {
                    "name": "Attacking Threat",
                    "features": [
                        "line_breaks_team_share",
                        "tries_team_share"
                    ]
                },
                "pc3": {
                    "name": "Defensive Workrate",
                    "features": [
                        "tackles_made_team_share",
                        "tackle_efficiency"
                    ]
                }
            }
        },
        "Middle": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Ball Playing Middle",
                    "count": 20,
                    "description": "These middles often play in the lock position with strong ball playing skills, directing players in the middle of the park."
                },
                {
                    "id": 1,
                    "name": "Impact Middle",
                    "count": 117,
                    "description": "The most effective ball runners, these middles are characterised by strong carries, tackle breaks and post-contact metres."
                },
                {
                    "id": 2,
                    "name": "Standard Middle",
                    "count": 495,
                    "description": "Making up the rest of the middle, these players share the hit up and tackling duties."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Ball Playing",
                    "features": [
                        "passes_to_run_ratio",
                        "passes_team_share",
                        "line_break_assists_team_share",
                        "try_assists_team_share"
                    ]
                },
                "pc2": {
                    "name": "Ball Running",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "post_contact_metres_team_share",
                        "offloads_team_share"
                    ]
                },
                "pc3": {
                    "name": "Defense",
                    "features": [
                        "tackles_made_team_share",
                        "tackle_efficiency"
                    ]
                }
            }
        }
    },
    "2020s": {
        "Fullback": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Ball Running Fullback",
                    "count": 23,
                    "description": "Fullbacks who are quick and able to break the defensive line, and opt for game breaking runs over tough carries."
                },
                {
                    "id": 1,
                    "name": "Balanced Fullback",
                    "count": 37,
                    "description": "These well rounded fullbacks balance workrate, playmaking and elusiveness making them the complete package."
                },
                {
                    "id": 2,
                    "name": "Workhorse Fullback",
                    "count": 41,
                    "description": "High-effort players who are always around the ball. They rack up high run metres and support plays."
                },
                {
                    "id": 3,
                    "name": "Playmaker Fullback",
                    "count": 38,
                    "description": "These playmakers save their energy for the big moments, with reduced workrates but high involvement in tries and try assists."
                },
                {
                    "id": 4,
                    "name": "Support Fullback",
                    "count": 43,
                    "description": "Players who are less involved in attack, but may specialise in defense or defusing kicks."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Playmaking",
                    "features": [
                        "line_break_assists_team_share",
                        "try_assists_team_share",
                        "passes_team_share"
                    ]
                },
                "pc2": {
                    "name": "Evasiveness",
                    "features": [
                        "line_breaks_team_share",
                        "tries_team_share",
                        "tackle_breaks_team_share"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "post_contact_metres_team_share",
                        "all_runs_team_share"
                    ]
                }
            }
        },
        "Winger": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Support Winger",
                    "count": 142,
                    "description": "These wingers tend to be less involved in the game, perhaps due to lack of skill or opportunity."
                },
                {
                    "id": 1,
                    "name": "Finisher Winger",
                    "count": 108,
                    "description": "Wingers who are specialist try scorers, often with great positional awareness and speed."
                },
                {
                    "id": 2,
                    "name": "Workhorse Winger",
                    "count": 125,
                    "description": "High involvement wingers who are strong in contact, often taking carries out of their own end."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Strength In Contact",
                    "features": [
                        "tackle_breaks_team_share",
                        "offloads_team_share",
                        "post_contact_metres_team_share"
                    ]
                },
                "pc2": {
                    "name": "Try Scoring",
                    "features": [
                        "tries_team_share",
                        "line_breaks_team_share"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "all_runs_team_share"
                    ]
                }
            }
        },
        "Centre": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Link Centre",
                    "count": 72,
                    "description": "These centres play more of a Five-Eighth role with a high pass to run ratio, often looking to set up their winger."
                },
                {
                    "id": 1,
                    "name": "Workhorse Centre",
                    "count": 95,
                    "description": "Attacking weapons who are heavily involved in gaining metres aswell as breaking the line and scoring tries."
                },
                {
                    "id": 2,
                    "name": "Support Centre",
                    "count": 112,
                    "description": "These players are less involved with ball in hand and may play other roles for the team."
                },
                {
                    "id": 3,
                    "name": "Strike Centre",
                    "count": 87,
                    "description": "Centres who are heavily involved in try scoring, and may look to set up those around them rather than taking tough carries."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Passing",
                    "features": [
                        "passes_team_share",
                        "pass_run_ratio",
                        "line_break_assists_team_share",
                        "try_assists_team_share"
                    ]
                },
                "pc2": {
                    "name": "Try Scoring",
                    "features": [
                        "tries_team_share",
                        "line_breaks_team_share"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "all_runs_team_share"
                    ]
                }
            }
        },
        "Half": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Dominant Half",
                    "count": 92,
                    "description": "These players control the attack, and are usually relied upon to set up tries and do most of the kicking."
                },
                {
                    "id": 1,
                    "name": "Running Half",
                    "count": 111,
                    "description": "Halves with strong running games who look to break the line, usually Five-Eighths."
                },
                {
                    "id": 2,
                    "name": "Organising Half",
                    "count": 135,
                    "description": "Less dominant halves who may rely on their halves partner to control the attack, focusing on organising their edge."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Running",
                    "features": [
                        "tries_team_share",
                        "all_run_metres_team_share",
                        "line_breaks_team_share",
                        "tackle_breaks_team_share"
                    ]
                },
                "pc2": {
                    "name": "Creativity",
                    "features": [
                        "line_break_assists_team_share",
                        "try_assists_team_share",
                        "forced_drop_outs_team_share",
                        "forty_twenty_team_share"
                    ]
                },
                "pc3": {
                    "name": "Kicking",
                    "features": [
                        "kicks_team_share",
                        "kicking_metres_team_share",
                        "one_point_field_goals_team_share"
                    ]
                }
            }
        },
        "Hooker": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Balanced Hooker",
                    "count": 73,
                    "description": "Hookers who balance dummy half runs and creativity."
                },
                {
                    "id": 1,
                    "name": "Running Hooker",
                    "count": 32,
                    "description": "Strong ball running hookers who often look to run from dummy half."
                },
                {
                    "id": 2,
                    "name": "Link Hooker",
                    "count": 35,
                    "description": "Hookers that look to pass rather than run, usually having strong ball playing."
                },
                {
                    "id": 3,
                    "name": "Crafty Hooker",
                    "count": 24,
                    "description": "Creative types who specialise in finding the right pass for their forwards."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Ball Running",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "line_breaks_team_share",
                        "tries_team_share"
                    ]
                },
                "pc2": {
                    "name": "Creativity",
                    "features": [
                        "try_assists_team_share",
                        "line_break_assists_team_share",
                        "forty_twenty_team_share",
                        "forced_drop_outs_team_share"
                    ]
                },
                "pc3": {
                    "name": "Pass - Run Ratio",
                    "features": [
                        "passes_to_run_ratio"
                    ]
                }
            }
        },
        "Edge": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Defensive Enforcer Edge",
                    "count": 122,
                    "description": "Defensive specialists who are key in protecting their edge. Less involved in attacking situations."
                },
                {
                    "id": 1,
                    "name": "Support Edge",
                    "count": 78,
                    "description": "These edges are less involved in attack and defense, and may specialise in other areas."
                },
                {
                    "id": 2,
                    "name": "Strong Attacking Edge",
                    "count": 51,
                    "description": "These players are strong in contact and are relied upon to make metres for their team, often involved in tries as a result."
                },
                {
                    "id": 3,
                    "name": "Strike Attacking Edge",
                    "count": 115,
                    "description": "Great line runners, often breaking the line and scoring tries, playing like a centre in attack."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Attacking Workrate",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "offloads_team_share",
                        "hit_ups_team_share"
                    ]
                },
                "pc2": {
                    "name": "Attacking Threat",
                    "features": [
                        "line_breaks_team_share",
                        "tries_team_share"
                    ]
                },
                "pc3": {
                    "name": "Defensive Workrate",
                    "features": [
                        "tackles_made_team_share",
                        "tackle_efficiency"
                    ]
                }
            }
        },
        "Middle": {
            "stat_mode": "team_share",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Ball Playing Middle",
                    "count": 32,
                    "description": "These middles often play in the lock position with strong ball playing skills, directing players in the middle of the park."
                },
                {
                    "id": 1,
                    "name": "Impact Middle",
                    "count": 96,
                    "description": "The most effective ball runners, these middles are characterised by strong carries, tackle breaks and post-contact metres."
                },
                {
                    "id": 2,
                    "name": "Standard Middle",
                    "count": 338,
                    "description": "Making up the rest of the middle, these players share the hit up and tackling duties."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Ball Playing",
                    "features": [
                        "passes_to_run_ratio",
                        "passes_team_share",
                        "line_break_assists_team_share",
                        "try_assists_team_share"
                    ]
                },
                "pc2": {
                    "name": "Ball Running",
                    "features": [
                        "all_run_metres_team_share",
                        "tackle_breaks_team_share",
                        "post_contact_metres_team_share",
                        "offloads_team_share"
                    ]
                },
                "pc3": {
                    "name": "Defense",
                    "features": [
                        "tackles_made_team_share",
                        "tackle_efficiency"
                    ]
                }
            }
        }
    }
};