import unittest

from pydantic import ValidationError

from backend.main import GenerateRequest, SlidingWindowRateLimiter


class BackendContractTests(unittest.TestCase):
    def test_generation_input_has_hard_character_limit(self) -> None:
        with self.assertRaises(ValidationError):
            GenerateRequest(userInput="x" * 4001)

    def test_rate_limiter_reopens_after_window(self) -> None:
        now = [100.0]
        limiter = SlidingWindowRateLimiter(
            limit=2,
            window_seconds=60,
            clock=lambda: now[0],
        )

        self.assertTrue(limiter.allow("client"))
        self.assertTrue(limiter.allow("client"))
        self.assertFalse(limiter.allow("client"))

        now[0] = 161.0
        self.assertTrue(limiter.allow("client"))


if __name__ == "__main__":
    unittest.main()
