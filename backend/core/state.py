from collections import defaultdict

online_users = defaultdict(dict)
online_counts = defaultdict(lambda: defaultdict(int))
voice_participants = defaultdict(dict)
voice_owners = defaultdict(dict)
session_channels = defaultdict(dict)
