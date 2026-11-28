import os
import plistlib
import sys

with open(sys.argv[1], 'wb') as stream:
    plistlib.dump({
        'method': 'app-store-connect', 'destination': 'export',
        'signingStyle': 'manual', 'signingCertificate': 'Apple Distribution',
        'teamID': os.environ['POCKET_APPLE_TEAM'],
        'provisioningProfiles': {'com.mingonsong.pocketbudget': os.environ['POCKET_IOS_PROVISIONING_PROFILE']},
        'manageAppVersionAndBuildNumber': False, 'uploadSymbols': True,
    }, stream)
