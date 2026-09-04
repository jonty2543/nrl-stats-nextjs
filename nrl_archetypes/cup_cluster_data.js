const cupClusterData = {
    "All": {
        "Fullback": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Ball Running Fullback",
                    "count": 67,
                    "description": "Fullbacks who are quick and able to break the defensive line, and opt for game breaking runs over tough carries."
                },
                {
                    "id": 1,
                    "name": "Balanced Fullback",
                    "count": 106,
                    "description": "These well rounded fullbacks balance workrate, playmaking and elusiveness making them the complete package."
                },
                {
                    "id": 2,
                    "name": "Workhorse Fullback",
                    "count": 69,
                    "description": "High-effort players who are always around the ball. They rack up high run metres and support plays."
                },
                {
                    "id": 3,
                    "name": "Playmaker Fullback",
                    "count": 81,
                    "description": "These playmakers save their energy for the big moments, with reduced workrates but high involvement in tries and try assists."
                },
                {
                    "id": 4,
                    "name": "Support Fullback",
                    "count": 140,
                    "description": "Players who are less involved in attack, but may specialise in defense or defusing kicks."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Playmaking",
                    "features": [
                        "line_break_assists_per_80",
                        "try_assists_per_80",
                        "passes_per_80"
                    ]
                },
                "pc2": {
                    "name": "Evasiveness",
                    "features": [
                        "line_breaks_per_80",
                        "tries_per_80",
                        "tackle_breaks_per_80"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_per_80",
                        "post_contact_metres_per_80",
                        "all_runs_per_80"
                    ]
                }
            }
        },
        "Winger": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Support Winger",
                    "count": 408,
                    "description": "These wingers tend to be less involved in the game, perhaps due to lack of skill or opportunity."
                },
                {
                    "id": 1,
                    "name": "Finisher Winger",
                    "count": 237,
                    "description": "Wingers who are specialist try scorers, often with great positional awareness and speed."
                },
                {
                    "id": 2,
                    "name": "Workhorse Winger",
                    "count": 317,
                    "description": "High involvement wingers who are strong in contact, often taking carries out of their own end."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Strength In Contact",
                    "features": [
                        "tackle_breaks_per_80",
                        "offloads_per_80",
                        "post_contact_metres_per_80"
                    ]
                },
                "pc2": {
                    "name": "Try Scoring",
                    "features": [
                        "tries_per_80",
                        "line_breaks_per_80"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_per_80",
                        "all_runs_per_80"
                    ]
                }
            }
        },
        "Centre": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Link Centre",
                    "count": 202,
                    "description": "These centres play more of a Five-Eighth role with a high pass to run ratio, often looking to set up their winger."
                },
                {
                    "id": 1,
                    "name": "Workhorse Centre",
                    "count": 263,
                    "description": "Attacking weapons who are heavily involved in gaining metres aswell as breaking the line and scoring tries."
                },
                {
                    "id": 2,
                    "name": "Support Centre",
                    "count": 316,
                    "description": "These players are less involved with ball in hand and may play other roles for the team."
                },
                {
                    "id": 3,
                    "name": "Strike Centre",
                    "count": 193,
                    "description": "Centres who are heavily involved in try scoring, and may look to set up those around them rather than taking tough carries."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Passing",
                    "features": [
                        "passes_per_80",
                        "pass_run_ratio",
                        "line_break_assists_per_80",
                        "try_assists_per_80"
                    ]
                },
                "pc2": {
                    "name": "Try Scoring",
                    "features": [
                        "tries_per_80",
                        "line_breaks_per_80"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_per_80",
                        "tackle_breaks_per_80",
                        "all_runs_per_80"
                    ]
                }
            }
        },
        "Half": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Dominant Half",
                    "count": 238,
                    "description": "These players control the attack, and are usually relied upon to set up tries and do most of the kicking."
                },
                {
                    "id": 1,
                    "name": "Running Half",
                    "count": 235,
                    "description": "Halves with strong running games who look to break the line, usually Five-Eighths."
                },
                {
                    "id": 2,
                    "name": "Organising Half",
                    "count": 476,
                    "description": "Less dominant halves who may rely on their halves partner to control the attack, focusing on organising their edge."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Running",
                    "features": [
                        "tries_per_80",
                        "all_run_metres_per_80",
                        "line_breaks_per_80",
                        "tackle_breaks_per_80"
                    ]
                },
                "pc2": {
                    "name": "Creativity",
                    "features": [
                        "line_break_assists_per_80",
                        "try_assists_per_80",
                        "forced_drop_outs_per_80",
                        "forty_twenty_per_80"
                    ]
                },
                "pc3": {
                    "name": "Kicking",
                    "features": [
                        "kicks_per_80",
                        "kicking_metres_per_80",
                        "one_point_field_goals_per_80"
                    ]
                }
            }
        },
        "Hooker": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Balanced Hooker",
                    "count": 208,
                    "description": "Hookers who balance dummy half runs and creativity."
                },
                {
                    "id": 1,
                    "name": "Running Hooker",
                    "count": 96,
                    "description": "Strong ball running hookers who often look to run from dummy half."
                },
                {
                    "id": 2,
                    "name": "Link Hooker",
                    "count": 87,
                    "description": "Hookers that look to pass rather than run, usually having strong ball playing."
                },
                {
                    "id": 3,
                    "name": "Crafty Hooker",
                    "count": 58,
                    "description": "Creative types who specialise in finding the right pass for their forwards."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Ball Running",
                    "features": [
                        "all_run_metres",
                        "tackle_breaks",
                        "line_breaks",
                        "tries"
                    ]
                },
                "pc2": {
                    "name": "Creativity",
                    "features": [
                        "try_assists",
                        "line_break_assists",
                        "forty_twenty",
                        "forced_drop_outs"
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
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Defensive Enforcer Edge",
                    "count": 263,
                    "description": "Defensive specialists who are key in protecting their edge. Less involved in attacking situations."
                },
                {
                    "id": 1,
                    "name": "Support Edge",
                    "count": 378,
                    "description": "These edges are less involved in attack and defense, and may specialise in other areas."
                },
                {
                    "id": 2,
                    "name": "Strong Attacking Edge",
                    "count": 180,
                    "description": "These players are strong in contact and are relied upon to make metres for their team, often involved in tries as a result."
                },
                {
                    "id": 3,
                    "name": "Strike Attacking Edge",
                    "count": 131,
                    "description": "Great line runners, often breaking the line and scoring tries, playing like a centre in attack."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Attacking Workrate",
                    "features": [
                        "all_run_metres",
                        "tackle_breaks",
                        "offloads",
                        "hit_ups"
                    ]
                },
                "pc2": {
                    "name": "Attacking Threat",
                    "features": [
                        "line_breaks",
                        "tries"
                    ]
                },
                "pc3": {
                    "name": "Defensive Workrate",
                    "features": [
                        "tackles_made",
                        "tackle_efficiency"
                    ]
                }
            }
        },
        "Middle": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Ball Playing Middle",
                    "count": 35,
                    "description": "These middles often play in the lock position with strong ball playing skills, directing players in the middle of the park."
                },
                {
                    "id": 1,
                    "name": "Impact Middle",
                    "count": 288,
                    "description": "The most effective ball runners, these middles are characterised by strong carries, tackle breaks and post-contact metres."
                },
                {
                    "id": 2,
                    "name": "Standard Middle",
                    "count": 931,
                    "description": "Making up the rest of the middle, these players share the hit up and tackling duties."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Ball Playing",
                    "features": [
                        "passes_to_run_ratio",
                        "passes",
                        "line_break_assists",
                        "try_assists"
                    ]
                },
                "pc2": {
                    "name": "Ball Running",
                    "features": [
                        "all_run_metres",
                        "tackle_breaks",
                        "post_contact_metres",
                        "offloads"
                    ]
                },
                "pc3": {
                    "name": "Defense",
                    "features": [
                        "tackles_made",
                        "tackle_efficiency"
                    ]
                }
            }
        }
    },
    "2010s": {
        "Fullback": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Ball Running Fullback",
                    "count": 32,
                    "description": "Fullbacks who are quick and able to break the defensive line, and opt for game breaking runs over tough carries."
                },
                {
                    "id": 1,
                    "name": "Balanced Fullback",
                    "count": 48,
                    "description": "These well rounded fullbacks balance workrate, playmaking and elusiveness making them the complete package."
                },
                {
                    "id": 2,
                    "name": "Workhorse Fullback",
                    "count": 37,
                    "description": "High-effort players who are always around the ball. They rack up high run metres and support plays."
                },
                {
                    "id": 3,
                    "name": "Playmaker Fullback",
                    "count": 42,
                    "description": "These playmakers save their energy for the big moments, with reduced workrates but high involvement in tries and try assists."
                },
                {
                    "id": 4,
                    "name": "Support Fullback",
                    "count": 49,
                    "description": "Players who are less involved in attack, but may specialise in defense or defusing kicks."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Playmaking",
                    "features": [
                        "line_break_assists_per_80",
                        "try_assists_per_80",
                        "passes_per_80"
                    ]
                },
                "pc2": {
                    "name": "Evasiveness",
                    "features": [
                        "line_breaks_per_80",
                        "tries_per_80",
                        "tackle_breaks_per_80"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_per_80",
                        "post_contact_metres_per_80",
                        "all_runs_per_80"
                    ]
                }
            }
        },
        "Winger": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Support Winger",
                    "count": 181,
                    "description": "These wingers tend to be less involved in the game, perhaps due to lack of skill or opportunity."
                },
                {
                    "id": 1,
                    "name": "Finisher Winger",
                    "count": 114,
                    "description": "Wingers who are specialist try scorers, often with great positional awareness and speed."
                },
                {
                    "id": 2,
                    "name": "Workhorse Winger",
                    "count": 149,
                    "description": "High involvement wingers who are strong in contact, often taking carries out of their own end."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Strength In Contact",
                    "features": [
                        "tackle_breaks_per_80",
                        "offloads_per_80",
                        "post_contact_metres_per_80"
                    ]
                },
                "pc2": {
                    "name": "Try Scoring",
                    "features": [
                        "tries_per_80",
                        "line_breaks_per_80"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_per_80",
                        "all_runs_per_80"
                    ]
                }
            }
        },
        "Centre": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Link Centre",
                    "count": 87,
                    "description": "These centres play more of a Five-Eighth role with a high pass to run ratio, often looking to set up their winger."
                },
                {
                    "id": 1,
                    "name": "Workhorse Centre",
                    "count": 122,
                    "description": "Attacking weapons who are heavily involved in gaining metres aswell as breaking the line and scoring tries."
                },
                {
                    "id": 2,
                    "name": "Support Centre",
                    "count": 138,
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
                        "passes_per_80",
                        "pass_run_ratio",
                        "line_break_assists_per_80",
                        "try_assists_per_80"
                    ]
                },
                "pc2": {
                    "name": "Try Scoring",
                    "features": [
                        "tries_per_80",
                        "line_breaks_per_80"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_per_80",
                        "tackle_breaks_per_80",
                        "all_runs_per_80"
                    ]
                }
            }
        },
        "Half": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Dominant Half",
                    "count": 104,
                    "description": "These players control the attack, and are usually relied upon to set up tries and do most of the kicking."
                },
                {
                    "id": 1,
                    "name": "Running Half",
                    "count": 101,
                    "description": "Halves with strong running games who look to break the line, usually Five-Eighths."
                },
                {
                    "id": 2,
                    "name": "Organising Half",
                    "count": 224,
                    "description": "Less dominant halves who may rely on their halves partner to control the attack, focusing on organising their edge."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Running",
                    "features": [
                        "tries_per_80",
                        "all_run_metres_per_80",
                        "line_breaks_per_80",
                        "tackle_breaks_per_80"
                    ]
                },
                "pc2": {
                    "name": "Creativity",
                    "features": [
                        "line_break_assists_per_80",
                        "try_assists_per_80",
                        "forced_drop_outs_per_80",
                        "forty_twenty_per_80"
                    ]
                },
                "pc3": {
                    "name": "Kicking",
                    "features": [
                        "kicks_per_80",
                        "kicking_metres_per_80",
                        "one_point_field_goals_per_80"
                    ]
                }
            }
        },
        "Hooker": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Balanced Hooker",
                    "count": 95,
                    "description": "Hookers who balance dummy half runs and creativity."
                },
                {
                    "id": 1,
                    "name": "Running Hooker",
                    "count": 42,
                    "description": "Strong ball running hookers who often look to run from dummy half."
                },
                {
                    "id": 2,
                    "name": "Link Hooker",
                    "count": 44,
                    "description": "Hookers that look to pass rather than run, usually having strong ball playing."
                },
                {
                    "id": 3,
                    "name": "Crafty Hooker",
                    "count": 26,
                    "description": "Creative types who specialise in finding the right pass for their forwards."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Ball Running",
                    "features": [
                        "all_run_metres",
                        "tackle_breaks",
                        "line_breaks",
                        "tries"
                    ]
                },
                "pc2": {
                    "name": "Creativity",
                    "features": [
                        "try_assists",
                        "line_break_assists",
                        "forty_twenty",
                        "forced_drop_outs"
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
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Defensive Enforcer Edge",
                    "count": 161,
                    "description": "Defensive specialists who are key in protecting their edge. Less involved in attacking situations."
                },
                {
                    "id": 1,
                    "name": "Support Edge",
                    "count": 105,
                    "description": "These edges are less involved in attack and defense, and may specialise in other areas."
                },
                {
                    "id": 2,
                    "name": "Strong Attacking Edge",
                    "count": 79,
                    "description": "These players are strong in contact and are relied upon to make metres for their team, often involved in tries as a result."
                },
                {
                    "id": 3,
                    "name": "Strike Attacking Edge",
                    "count": 89,
                    "description": "Great line runners, often breaking the line and scoring tries, playing like a centre in attack."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Attacking Workrate",
                    "features": [
                        "all_run_metres",
                        "tackle_breaks",
                        "offloads",
                        "hit_ups"
                    ]
                },
                "pc2": {
                    "name": "Attacking Threat",
                    "features": [
                        "line_breaks",
                        "tries"
                    ]
                },
                "pc3": {
                    "name": "Defensive Workrate",
                    "features": [
                        "tackles_made",
                        "tackle_efficiency"
                    ]
                }
            }
        },
        "Middle": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Ball Playing Middle",
                    "count": 9,
                    "description": "These middles often play in the lock position with strong ball playing skills, directing players in the middle of the park."
                },
                {
                    "id": 1,
                    "name": "Impact Middle",
                    "count": 133,
                    "description": "The most effective ball runners, these middles are characterised by strong carries, tackle breaks and post-contact metres."
                },
                {
                    "id": 2,
                    "name": "Standard Middle",
                    "count": 439,
                    "description": "Making up the rest of the middle, these players share the hit up and tackling duties."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Ball Playing",
                    "features": [
                        "passes_to_run_ratio",
                        "passes",
                        "line_break_assists",
                        "try_assists"
                    ]
                },
                "pc2": {
                    "name": "Ball Running",
                    "features": [
                        "all_run_metres",
                        "tackle_breaks",
                        "post_contact_metres",
                        "offloads"
                    ]
                },
                "pc3": {
                    "name": "Defense",
                    "features": [
                        "tackles_made",
                        "tackle_efficiency"
                    ]
                }
            }
        }
    },
    "2020s": {
        "Fullback": {
            "stat_mode": "production",
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
                    "count": 66,
                    "description": "These well rounded fullbacks balance workrate, playmaking and elusiveness making them the complete package."
                },
                {
                    "id": 2,
                    "name": "Workhorse Fullback",
                    "count": 33,
                    "description": "High-effort players who are always around the ball. They rack up high run metres and support plays."
                },
                {
                    "id": 3,
                    "name": "Playmaker Fullback",
                    "count": 43,
                    "description": "These playmakers save their energy for the big moments, with reduced workrates but high involvement in tries and try assists."
                },
                {
                    "id": 4,
                    "name": "Support Fullback",
                    "count": 76,
                    "description": "Players who are less involved in attack, but may specialise in defense or defusing kicks."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Playmaking",
                    "features": [
                        "line_break_assists_per_80",
                        "try_assists_per_80",
                        "passes_per_80"
                    ]
                },
                "pc2": {
                    "name": "Evasiveness",
                    "features": [
                        "line_breaks_per_80",
                        "tries_per_80",
                        "tackle_breaks_per_80"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_per_80",
                        "post_contact_metres_per_80",
                        "all_runs_per_80"
                    ]
                }
            }
        },
        "Winger": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Support Winger",
                    "count": 217,
                    "description": "These wingers tend to be less involved in the game, perhaps due to lack of skill or opportunity."
                },
                {
                    "id": 1,
                    "name": "Finisher Winger",
                    "count": 129,
                    "description": "Wingers who are specialist try scorers, often with great positional awareness and speed."
                },
                {
                    "id": 2,
                    "name": "Workhorse Winger",
                    "count": 172,
                    "description": "High involvement wingers who are strong in contact, often taking carries out of their own end."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Strength In Contact",
                    "features": [
                        "tackle_breaks_per_80",
                        "offloads_per_80",
                        "post_contact_metres_per_80"
                    ]
                },
                "pc2": {
                    "name": "Try Scoring",
                    "features": [
                        "tries_per_80",
                        "line_breaks_per_80"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_per_80",
                        "all_runs_per_80"
                    ]
                }
            }
        },
        "Centre": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Link Centre",
                    "count": 118,
                    "description": "These centres play more of a Five-Eighth role with a high pass to run ratio, often looking to set up their winger."
                },
                {
                    "id": 1,
                    "name": "Workhorse Centre",
                    "count": 139,
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
                    "count": 113,
                    "description": "Centres who are heavily involved in try scoring, and may look to set up those around them rather than taking tough carries."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Passing",
                    "features": [
                        "passes_per_80",
                        "pass_run_ratio",
                        "line_break_assists_per_80",
                        "try_assists_per_80"
                    ]
                },
                "pc2": {
                    "name": "Try Scoring",
                    "features": [
                        "tries_per_80",
                        "line_breaks_per_80"
                    ]
                },
                "pc3": {
                    "name": "Workrate",
                    "features": [
                        "all_run_metres_per_80",
                        "tackle_breaks_per_80",
                        "all_runs_per_80"
                    ]
                }
            }
        },
        "Half": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Dominant Half",
                    "count": 145,
                    "description": "These players control the attack, and are usually relied upon to set up tries and do most of the kicking."
                },
                {
                    "id": 1,
                    "name": "Running Half",
                    "count": 134,
                    "description": "Halves with strong running games who look to break the line, usually Five-Eighths."
                },
                {
                    "id": 2,
                    "name": "Organising Half",
                    "count": 241,
                    "description": "Less dominant halves who may rely on their halves partner to control the attack, focusing on organising their edge."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Running",
                    "features": [
                        "tries_per_80",
                        "all_run_metres_per_80",
                        "line_breaks_per_80",
                        "tackle_breaks_per_80"
                    ]
                },
                "pc2": {
                    "name": "Creativity",
                    "features": [
                        "line_break_assists_per_80",
                        "try_assists_per_80",
                        "forced_drop_outs_per_80",
                        "forty_twenty_per_80"
                    ]
                },
                "pc3": {
                    "name": "Kicking",
                    "features": [
                        "kicks_per_80",
                        "kicking_metres_per_80",
                        "one_point_field_goals_per_80"
                    ]
                }
            }
        },
        "Hooker": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Balanced Hooker",
                    "count": 107,
                    "description": "Hookers who balance dummy half runs and creativity."
                },
                {
                    "id": 1,
                    "name": "Running Hooker",
                    "count": 53,
                    "description": "Strong ball running hookers who often look to run from dummy half."
                },
                {
                    "id": 2,
                    "name": "Link Hooker",
                    "count": 47,
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
                        "all_run_metres",
                        "tackle_breaks",
                        "line_breaks",
                        "tries"
                    ]
                },
                "pc2": {
                    "name": "Creativity",
                    "features": [
                        "try_assists",
                        "line_break_assists",
                        "forty_twenty",
                        "forced_drop_outs"
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
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Defensive Enforcer Edge",
                    "count": 170,
                    "description": "Defensive specialists who are key in protecting their edge. Less involved in attacking situations."
                },
                {
                    "id": 1,
                    "name": "Support Edge",
                    "count": 182,
                    "description": "These edges are less involved in attack and defense, and may specialise in other areas."
                },
                {
                    "id": 2,
                    "name": "Strong Attacking Edge",
                    "count": 104,
                    "description": "These players are strong in contact and are relied upon to make metres for their team, often involved in tries as a result."
                },
                {
                    "id": 3,
                    "name": "Strike Attacking Edge",
                    "count": 62,
                    "description": "Great line runners, often breaking the line and scoring tries, playing like a centre in attack."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Attacking Workrate",
                    "features": [
                        "all_run_metres",
                        "tackle_breaks",
                        "offloads",
                        "hit_ups"
                    ]
                },
                "pc2": {
                    "name": "Attacking Threat",
                    "features": [
                        "line_breaks",
                        "tries"
                    ]
                },
                "pc3": {
                    "name": "Defensive Workrate",
                    "features": [
                        "tackles_made",
                        "tackle_efficiency"
                    ]
                }
            }
        },
        "Middle": {
            "stat_mode": "production",
            "archetypes": [
                {
                    "id": 0,
                    "name": "Ball Playing Middle",
                    "count": 33,
                    "description": "These middles often play in the lock position with strong ball playing skills, directing players in the middle of the park."
                },
                {
                    "id": 1,
                    "name": "Impact Middle",
                    "count": 146,
                    "description": "The most effective ball runners, these middles are characterised by strong carries, tackle breaks and post-contact metres."
                },
                {
                    "id": 2,
                    "name": "Standard Middle",
                    "count": 494,
                    "description": "Making up the rest of the middle, these players share the hit up and tackling duties."
                }
            ],
            "pc_axes": {
                "pc1": {
                    "name": "Ball Playing",
                    "features": [
                        "passes_to_run_ratio",
                        "passes",
                        "line_break_assists",
                        "try_assists"
                    ]
                },
                "pc2": {
                    "name": "Ball Running",
                    "features": [
                        "all_run_metres",
                        "tackle_breaks",
                        "post_contact_metres",
                        "offloads"
                    ]
                },
                "pc3": {
                    "name": "Defense",
                    "features": [
                        "tackles_made",
                        "tackle_efficiency"
                    ]
                }
            }
        }
    }
};